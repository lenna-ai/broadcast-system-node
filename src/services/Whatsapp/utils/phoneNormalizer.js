/**
 * Normalisasi nomor telepon menjadi format internasional (tanpa tanda +)
 * @param {string} phone - Nomor telepon mentah
 * @param {string} defaultCountryCode - Kode negara default (default: '62')
 * @returns {string} - Nomor yang sudah dinormalisasi
 */
const normalizeRecipients = (phone, defaultCountryCode = '62') => {
    // Safety check jika input kosong/null
    if (!phone) return phone;

    // Pastikan input berupa string dan bersihkan spasi awal/akhir
    phone = String(phone).trim();

    // 1. Jika input memiliki tanda '+' di awal, ini format internasional eksplisit.
    if (phone.startsWith('+')) {
        // Hapus tanda + dan semua karakter non-angka lainnya, lalu kembalikan
        return phone.replace(/\D/g, '');
    }

    // 2. Bersihkan semua karakter non-angka (spasi, strip, tanda kurung)
    phone = phone.replace(/\D/g, '');

    // 3. Jika nomor dimulai dengan '0' (Trunk prefix) -> potong 0, ganti jadi 62
    // (Ini otomatis meng-cover kasus '08' juga)
    if (phone.startsWith('0')) {
        return defaultCountryCode + phone.substring(1);
    }

    // 4. Jika nomor sudah diawali dengan country code default (misal 62812...)
    if (phone.startsWith(defaultCountryCode)) {
        return phone;
    }

    // 5. Jika nomor diawali dengan '8' saja (tanpa 0 atau 62) -> tambahkan 62 di depannya
    if (phone.startsWith('8')) {
        return defaultCountryCode + phone;
    }

    // 6. Jika input menggantung atau format lain, tempelkan default country code
    return defaultCountryCode + phone;
};

module.exports = {
    normalizeRecipients
};