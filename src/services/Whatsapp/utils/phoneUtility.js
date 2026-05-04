/**
 * Normalisasi nomor telepon menjadi format internasional (tanpa tanda +)
 * @param {string} phone - Nomor telepon mentah
 * @param {string} defaultCountryCode - Kode negara default (default: '62')
 * @returns {string} - Nomor yang sudah dinormalisasi
 */
const normalizeRecipients = (phone, defaultCountryCode = '62') => {
    if (!phone) return phone;

    phone = String(phone).trim();

    if (phone.startsWith('+')) {
        return phone.replace(/\D/g, '');
    }

    phone = phone.replace(/\D/g, '');

    if (phone.startsWith('0')) {
        return defaultCountryCode + phone.substring(1);
    }

    if (phone.startsWith(defaultCountryCode)) {
        return phone;
    }

    if (phone.startsWith('8')) {
        return defaultCountryCode + phone;
    }

    return defaultCountryCode + phone;
};

module.exports = {
    normalizeRecipients
};