const path = require('path');

const getMediaTypeFromUrl = (url) => {
    if (!url) return null;

    // ambil extension dari URL (handle query params juga)
    const cleanUrl = url.split('?')[0];
    const ext = path.extname(cleanUrl).replace('.', '').toLowerCase();

    const map = {
        pdf: 'document',
        png: 'image',
        jpg: 'image',
        jpeg: 'image',
        gif: 'image',
        mp4: 'video',
        mov: 'video',
        avi: 'video',
        '3gp': 'video',
        doc: 'document',
        docx: 'document',
    };

    return map[ext] || null;
};

module.exports = {
    getMediaTypeFromUrl,
};