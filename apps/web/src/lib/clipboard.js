/**
 * Copies text to the clipboard. Returns false when the browser refuses
 * (old browser, page not served over HTTPS/localhost, permission denied).
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
