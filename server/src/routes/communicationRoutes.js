import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

// GET /api/communication/channels
router.get('/channels', async (req, res) => {
  try {
    const userId = req.user.id;
    const dealershipId = req.dealershipId;

    const channels = await prisma.channel.findMany({
      where: {
        OR: [
          { dealershipId: dealershipId },
          { members: { some: { userId: userId } } }
        ]
      },
      include: {
        members: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const formattedChannels = channels.map(c => {
      const memberInfo = c.members.find(m => m.userId === userId);
      let unread = 0;
      if (memberInfo && c.messages[0]) {
        // Count messages after last read
        // For now approximate: if last message is after lastReadAt, show 1
        if (new Date(c.messages[0].createdAt) > new Date(memberInfo.lastReadAt)) {
          unread = 1;
        }
      }

      return {
        id: c.id,
        name: c.name || (c.type === 'DIRECT' ? 'Direct Message' : 'Unnamed Channel'),
        type: c.type,
        unread: unread,
        memberCount: c.members.length,
        lastMessage: c.messages[0] ? {
          text: c.messages[0].text,
          createdAt: c.messages[0].createdAt
        } : null
      };
    });

    res.json({ channels: formattedChannels });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ message: 'Failed to fetch channels' });
  }
});

// POST /api/communication/channels – create a new channel
router.post('/channels', async (req, res) => {
  try {
    const { name, type } = req.body;
    const dealershipId = req.dealershipId;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Channel name is required' });
    }

    // Get all users in the dealership to auto-add as members
    const users = await prisma.user.findMany({
      where: { dealershipId },
      select: { id: true }
    });

    const channel = await prisma.channel.create({
      data: {
        name: name.trim().toLowerCase(),
        type: type || 'INTERNAL',
        dealershipId,
        members: {
          create: users.map(u => ({ userId: u.id }))
        }
      }
    });

    res.status(201).json({ channel: { id: channel.id, name: channel.name, type: channel.type } });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ message: 'Failed to create channel' });
  }
});

// GET /api/communication/channels/:id/messages
router.get('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const messages = await prisma.message.findMany({
      where: { channelId: channelId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    // Update lastReadAt for this user
    await prisma.channelMember.updateMany({
      where: { channelId: channelId, userId: req.user.id },
      data: { lastReadAt: new Date() }
    });

    const formattedMessages = messages.map(m => ({
      id: m.id,
      senderId: m.sender.id,
      senderName: m.sender.name,
      role: m.sender.role,
      text: m.text,
      createdAt: m.createdAt
    }));

    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// POST /api/communication/channels/:id/messages
router.post('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const message = await prisma.message.create({
      data: {
        text: text.trim(),
        senderId: userId,
        channelId: channelId
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    res.status(201).json({ 
      id: message.id,
      senderId: message.sender.id,
      senderName: message.sender.name,
      role: message.sender.role,
      text: message.text,
      createdAt: message.createdAt
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// GET /api/communication/directory
router.get('/directory', async (req, res) => {
  try {
    const dealershipId = req.dealershipId;

    const users = await prisma.user.findMany({
      where: { dealershipId: dealershipId },
      select: {
        id: true,
        name: true,
        role: true,
      }
    });

    const directory = users.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      online: true, // Placeholder – would use presence system in production
      unread: 0
    }));

    res.json({ directory });
  } catch (error) {
    console.error('Error fetching directory:', error);
    res.status(500).json({ message: 'Failed to fetch directory' });
  }
});

// POST /api/communication/seed – Create default channels with all dealership staff
router.post('/seed', async (req, res) => {
  try {
    const dealershipId = req.dealershipId;
    const userId = req.user.id;

    // Get all users in this dealership
    const allUsers = await prisma.user.findMany({
      where: { dealershipId },
      select: { id: true }
    });

    const defaultChannels = [
      { name: 'general', type: 'INTERNAL' },
      { name: 'sales-team', type: 'INTERNAL' },
      { name: 'service-dept', type: 'INTERNAL' },
      { name: 'inter-dealership', type: 'INTER_DEALERSHIP' },
    ];

    const welcomeMessages = {
      'general': 'Welcome to the general channel! Use this for team-wide announcements.',
      'sales-team': 'Sales team channel is live. Share leads, deals, and wins here!',
      'service-dept': 'Service department updates and vehicle inspection reports go here.',
      'inter-dealership': 'Use this channel for cross-dealership communication and inventory sharing.',
    };

    for (const ch of defaultChannels) {
      const existing = await prisma.channel.findFirst({
        where: { dealershipId, name: ch.name }
      });

      if (!existing) {
        const created = await prisma.channel.create({
          data: {
            name: ch.name,
            type: ch.type,
            dealershipId,
            members: {
              create: allUsers.map(u => ({ userId: u.id }))
            }
          }
        });

        // Welcome message
        await prisma.message.create({
          data: {
            channelId: created.id,
            senderId: userId,
            text: welcomeMessages[ch.name] || `Welcome to #${ch.name}!`
          }
        });
      }
    }

    res.json({ message: 'Channels seeded successfully' });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ message: 'Failed to seed channels' });
  }
});

export default router;
