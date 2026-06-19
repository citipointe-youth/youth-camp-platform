export function maskPhone(phone: string): string {
  if (!phone) return '';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}

export function maskEmail(email: string): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at <= 1) return '****' + email.slice(at);
  return email.slice(0, 2) + '****' + email.slice(at);
}
