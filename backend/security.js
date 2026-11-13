const DEFAULT_CORS_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

const HOST = '127.0.0.1';

function isLocalOrigin(origin) {
    try {
        const url = new URL(origin);
        return url.protocol === 'http:' &&
            (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    } catch {
        return false;
    }
}

const configuredOrigins = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// Mesmo que CORS_ORIGINS seja alterada, origens externas nunca são liberadas.
const allowedOrigins = new Set(configuredOrigins.filter(isLocalOrigin));

const corsOptions = {
    origin(origin, callback) {
        // Requisições sem Origin (ex.: ferramentas locais) não usam CORS.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origem não permitida pelo CORS'));
    },
};

module.exports = { HOST, corsOptions, isLocalOrigin };
