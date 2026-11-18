import 'dotenv/config';
import app from './app.js';
import dbConnection from './db/dbConnection.js';

const port = process.env.PORT || 3000;

// Database Connection and Server
dbConnection()
    .then(() => {
        const server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${port} is already in use by another process.`);
            } else {
                console.error('Server error:', err.message);
            }
        });
    })
    .catch((err) => {
        console.error('Database Connection Failed:', err.message);
    });
