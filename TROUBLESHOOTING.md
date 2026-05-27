# Login Issue Troubleshooting Guide

## Issue: Login fails with connection timeout

## Step 1: Test Backend Directly

### Test if backend is running
Open your browser and visit:
```
https://dealerosai.onrender.com/api/ping
```

**Expected response**: `Server alive`

**If this fails**: The backend is not running or is sleeping

### Wake up the backend (if sleeping)
Render free tier spins down after 15-30 minutes of inactivity. Wake it up by:
1. Visit the Render dashboard
2. Click on your service
3. Check if it shows "Deployed" or "Deploying"
4. If it's sleeping, visit any URL to wake it up

## Step 2: Check Render Environment Variables

Go to your Render dashboard for `dealerosai` and verify these are set:

```
DATABASE_URL=your_mongodb_connection_string
JWT_SECRET=your_strong_secret
NODE_ENV=production
CLIENT_URL=https://your-vercel-frontend-url.vercel.app
VITE_API_ORIGIN=https://dealerosai.onrender.com
PORT=3001
```

**Critical variables**:
- `DATABASE_URL` - Must be a valid MongoDB connection string
- `JWT_SECRET` - Must be set (any strong string)
- `PORT` - Should be 3001

## Step 3: Check Render Logs

1. Go to Render dashboard
2. Click on your service
3. Click "Logs" tab
4. Look for errors:
   - Database connection errors
   - Port binding errors
   - Missing environment variables
   - Prisma client generation errors

## Step 4: Check Vercel Deployment

1. Go to Vercel dashboard
2. Check if the latest deployment completed successfully
3. Look for build errors in deployment logs
4. Verify the deployment used the new `vercel.json`

## Step 5: Test API Endpoint Directly

Test the login endpoint directly:
```bash
curl -X POST https://dealerosai.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'
```

**Expected response**:
```json
{
  "token": "...",
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": "...",
    "dealership": {...}
  }
}
```

## Step 6: Check Browser Console

1. Open your deployed frontend
2. Press F12 to open browser console
3. Go to Network tab
4. Try to login
5. Look for the `/api/auth/login` request
6. Check:
   - Request URL (should be proxied through Vercel)
   - Response status (should be 200, not timeout)
   - Response body
   - CORS errors

## Step 7: Verify Vercel Environment Variables

If your frontend needs environment variables, set them in Vercel:

1. Go to Vercel dashboard
2. Click your project
3. Settings → Environment Variables
4. Add if needed:
   ```
   VITE_API_ORIGIN= (leave empty for production)
   ```

## Common Issues & Solutions

### Issue: "net::ERR_CONNECTION_TIMED_OUT"
**Cause**: Backend is sleeping or not running
**Solution**: 
- Wake up backend by visiting `https://dealerosai.onrender.com/api/ping`
- Check Render logs for errors
- Ensure all environment variables are set

### Issue: "Database connection failed"
**Cause**: Invalid DATABASE_URL or MongoDB cluster issue
**Solution**:
- Verify DATABASE_URL is correct in Render
- Check MongoDB Atlas whitelist (allow 0.0.0.0/0)
- Ensure MongoDB cluster is running

### Issue: "JWT_SECRET not set"
**Cause**: Missing environment variable
**Solution**: Add JWT_SECRET in Render environment variables

### Issue: "CORS error"
**Cause**: Origin not allowed (but our config allows all)
**Solution**: This shouldn't happen with current config, but check if CLIENT_URL is set correctly

## Quick Fix Commands

### Redeploy backend on Render
```bash
# In Render dashboard, click "Manual Deploy" → "Deploy latest commit"
```

### Restart backend service
```bash
# In Render dashboard, click "Restart Service"
```

### Clear browser cache
- Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or use incognito mode

## Next Steps

If all above checks pass and login still fails:

1. **Check if user exists in database**
   - You may need to create a test user via the registration endpoint

2. **Test registration instead**
   - Try registering a new user at `/register`
   - If registration works, the issue is with existing user credentials

3. **Check dealership status**
   - The backend blocks login if dealership is suspended
   - Verify dealership.isActive is true in database

4. **Contact support**
   - If all else fails, check Render and Vercel support docs
