import { apiUrl } from './api';

/**
 * Robustly fetches a binary PDF from the backend and opens it in a new tab.
 * This avoids memory overhead and corruption issues associated with large Base64 strings in JSON.
 */
export async function openBinaryDocument(endpoint: string, token: string | null, fileName: string) {
  if (!token) return;

  try {
    const response = await fetch(apiUrl(endpoint), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch document');
    }

    // Receive the PDF as a raw binary Blob
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download for maximum compatibility
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up after a delay to ensure the browser has processed the file
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    
    return true;
  } catch (err) {
    console.error('Binary download failed:', err);
    throw err;
  }
}
