import React, { useEffect, useState } from 'react';
import notificationManager from '../utils/notificationManager';
import { Modal, Button, Badge } from './ui';

const toneVariant = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  info: 'info',
};

const NotificationSettings = ({ onClose }) => {
  const [status, setStatus] = useState('default');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setStatus(notificationManager.getPermissionStatus());
  }, []);

  const model = notificationManager.getPermissionModel(status);

  const handleRequest = async () => {
    if (!model.canRequest) {
      onClose?.();
      return;
    }

    setRequesting(true);
    try {
      await notificationManager.requestPermission();
      setStatus(notificationManager.getPermissionStatus());
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Notification settings"
      size="md"
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {model.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {model.message}
            </p>
          </div>
          <Badge variant={toneVariant[model.tone] || 'info'}>
            {status}
          </Badge>
        </div>

        <p className="text-sm leading-6 text-[var(--color-text-tertiary)]">
          {model.detail}
        </p>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleRequest}
            loading={requesting}
            disabled={status === 'granted' || status === 'not-supported'}
          >
            {model.actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NotificationSettings;
