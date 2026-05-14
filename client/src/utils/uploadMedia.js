const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Upload a file to Cloudinary via the server endpoint.
 * @param {File} file - The File object to upload
 * @param {Function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<{url, publicId, mimeType, filename, size, resourceType}>}
 */
export async function uploadMedia(file, onProgress) {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid server response'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', `${API_URL}/upload`);
    xhr.setRequestHeader('x-auth-token', token);
    xhr.send(formData);
  });
}

/**
 * Helper: get a human-readable file size string
 */
export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Classify a MIME type or filename into a display category
 */
export function getMediaCategory(mimeType = '', filename = '') {
  const mime = (mimeType || '').toLowerCase();
  const file = (filename || '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  
  if (mime === 'application/pdf' || file.endsWith('.pdf')) return 'pdf';
  
  if (
    mime.includes('powerpoint') ||
    mime.includes('presentation') ||
    mime.endsWith('.pptx') ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    file.endsWith('.pptx') ||
    file.endsWith('.ppt')
  ) return 'pptx';
  
  if (
    mime.includes('word') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.endsWith('.docx') ||
    file.endsWith('.doc')
  ) return 'docx';
  
  if (
    mime.includes('excel') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.endsWith('.xlsx') ||
    file.endsWith('.xls') ||
    file.endsWith('.csv')
  ) return 'xlsx';
  
  return 'file';
}
