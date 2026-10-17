export const LEASE_ANGLES = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left side' },
  { key: 'right', label: 'Right side' },
  { key: 'front_left', label: 'Front-left corner' },
  { key: 'front_right', label: 'Front-right corner' },
  { key: 'rear_left', label: 'Rear-left corner' },
  { key: 'rear_right', label: 'Rear-right corner' },
  { key: 'wheel_front_left', label: 'Front-left wheel / rim' },
  { key: 'wheel_front_right', label: 'Front-right wheel / rim' },
  { key: 'wheel_rear_left', label: 'Rear-left wheel / rim' },
  { key: 'wheel_rear_right', label: 'Rear-right wheel / rim' },
] as const;

export type LeaseAngleKey = (typeof LEASE_ANGLES)[number]['key'];
