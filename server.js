const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const ExcelJS = require('exceljs');
const net = require('net');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIP();

// Initialize SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');

        // Create users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ps_number TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating users table:', err);
            else console.log('✅ Users table ready');
        });

        // Create time_entries table
        db.run(`CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            komatsu REAL DEFAULT 0,
            brunswick REAL DEFAULT 0,
            abb_india REAL DEFAULT 0,
            omnion REAL DEFAULT 0,
            rinnai REAL DEFAULT 0,
            oshkosh REAL DEFAULT 0,
            polaris REAL DEFAULT 0,
            volvo REAL DEFAULT 0,
            bridgestone REAL DEFAULT 0,
            wartsila_uk REAL DEFAULT 0,
            mtu REAL DEFAULT 0,
            mhi REAL DEFAULT 0,
            free_hours REAL DEFAULT 0,
            non_billable_hours REAL DEFAULT 0,
            training_hours REAL DEFAULT 0,
            remarks TEXT,
            available_hours REAL DEFAULT 9.5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, date)
        )`, (err) => {
            if (err) console.error('Error creating time_entries table:', err);
            else console.log('✅ Time entries table ready');
        });

        // Create projects table for admin management
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating projects table:', err);
            else {
                console.log('✅ Projects table ready');
                // Insert default projects
                const defaultProjects = [
                    'Komatsu', 'Brunswick', 'ABB India', 'Omnion', 'Rinnai',
                    'Oshkosh', 'Polaris', 'Volvo', 'Bridgestone', 'Wartsila UK',
                    'MTU', 'MHI', 'Free Hours', 'Non-Billable Hours', 'Training Hours'
                ];

                defaultProjects.forEach(project => {
                    db.run('INSERT OR IGNORE INTO projects (name) VALUES (?)', [project]);
                });
            }
        });
    }
});

// Admin password (you can change this)
const ADMIN_PASSWORD = 'admin123';

// Function to check if port is available
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => {
                server.close();
                resolve(true);
            })
            .listen(port);
    });
}

// Function to find available port
async function findAvailablePort(startPort = 3000, maxPort = 4000) {
    for (let port = startPort; port <= maxPort; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    throw new Error(`No available ports found between ${startPort} and ${maxPort}`);
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Admin route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Network info route
app.get('/network-info', (req, res) => {
    const networkInfo = {
        ip: LOCAL_IP,
        port: server.address().port,
        urls: [
            `http://${LOCAL_IP}:${server.address().port}`,
            `http://localhost:${server.address().port}`
        ]
    };
    res.json(networkInfo);
});

// Admin login endpoint
app.post('/admin-login', (req, res) => {
    const { password } = req.body;

    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Admin login successful' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid admin password' });
    }
});

// Get all users (for admin management)
app.get('/admin/users', (req, res) => {
    db.all('SELECT id, ps_number, name, created_at FROM users ORDER BY name', (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, users: rows });
    });
});

// Delete user (admin only)
app.delete('/admin/users/:userId', (req, res) => {
    const userId = req.params.userId;

    // First delete user's time entries to maintain referential integrity
    db.run('DELETE FROM time_entries WHERE user_id = ?', [userId], function(err) {
        if (err) {
            console.error('Error deleting user time entries:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete user data' });
        }

        // Then delete the user
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
            if (err) {
                console.error('Error deleting user:', err);
                return res.status(500).json({ success: false, message: 'Failed to delete user' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            console.log(`✅ User ${userId} deleted successfully`);
            res.json({ 
                success: true, 
                message: 'User deleted successfully',
                deletedEntries: this.changes
            });
        });
    });
});

// Get all projects (for admin)
app.get('/admin/projects', (req, res) => {
    db.all('SELECT * FROM projects ORDER BY name', (err, rows) => {
        if (err) {
            console.error('Error fetching projects:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, projects: rows });
    });
});

// Add new project
app.post('/admin/projects', (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Project name is required' });
    }

    db.run('INSERT INTO projects (name) VALUES (?)', [name], function (err) {
        if (err) {
            console.error('Error adding project:', err);
            return res.status(500).json({ success: false, message: 'Failed to add project' });
        }
        res.json({ success: true, message: 'Project added successfully', projectId: this.lastID });
    });
});

// Toggle project status
app.put('/admin/projects/:id/toggle', (req, res) => {
    const projectId = req.params.id;

    db.run('UPDATE projects SET is_active = NOT is_active WHERE id = ?', [projectId], function (err) {
        if (err) {
            console.error('Error toggling project:', err);
            return res.status(500).json({ success: false, message: 'Failed to update project' });
        }
        res.json({ success: true, message: 'Project status updated' });
    });
});

// Delete project
app.delete('/admin/projects/:id', (req, res) => {
    const projectId = req.params.id;

    db.run('DELETE FROM projects WHERE id = ?', [projectId], function (err) {
        if (err) {
            console.error('Error deleting project:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete project' });
        }
        res.json({ success: true, message: 'Project deleted successfully' });
    });
});

// Get all users data for admin
app.get('/admin/users-data', (req, res) => {
    const query = `
        SELECT 
            u.id as user_id,
            u.name as user_name,
            u.ps_number,
            te.date,
            te.komatsu,
            te.brunswick,
            te.abb_india,
            te.omnion,
            te.rinnai,
            te.oshkosh,
            te.polaris,
            te.volvo,
            te.bridgestone,
            te.wartsila_uk,
            te.mtu,
            te.mhi,
            te.free_hours,
            te.non_billable_hours,
            te.training_hours,
            te.remarks,
            te.available_hours,
            te.created_at
        FROM users u
        LEFT JOIN time_entries te ON u.id = te.user_id
        ORDER BY u.name, te.date DESC
    `;

    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching users data:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, data: rows });
    });
});

// Export to Excel
app.get('/admin/export-excel', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Time Entries');

        // Add headers
        worksheet.columns = [
            { header: 'User Name', key: 'user_name', width: 20 },
            { header: 'PS Number', key: 'ps_number', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Komatsu', key: 'komatsu', width: 10 },
            { header: 'Brunswick', key: 'brunswick', width: 10 },
            { header: 'ABB India', key: 'abb_india', width: 10 },
            { header: 'Omnion', key: 'omnion', width: 10 },
            { header: 'Rinnai', key: 'rinnai', width: 10 },
            { header: 'Oshkosh', key: 'oshkosh', width: 10 },
            { header: 'Polaris', key: 'polaris', width: 10 },
            { header: 'Volvo', key: 'volvo', width: 10 },
            { header: 'Bridgestone', key: 'bridgestone', width: 12 },
            { header: 'Wartsila UK', key: 'wartsila_uk', width: 12 },
            { header: 'MTU', key: 'mtu', width: 10 },
            { header: 'MHI', key: 'mhi', width: 10 },
            { header: 'Free Hours', key: 'free_hours', width: 12 },
            { header: 'Non-Billable', key: 'non_billable_hours', width: 15 },
            { header: 'Training', key: 'training_hours', width: 12 },
            { header: 'Available Hours', key: 'available_hours', width: 15 },
            { header: 'Remarks', key: 'remarks', width: 30 },
            { header: 'Entry Date', key: 'created_at', width: 15 }
        ];

        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6FA' }
        };

        // Get data
        const query = `
            SELECT 
                u.name as user_name,
                u.ps_number,
                te.date,
                te.komatsu,
                te.brunswick,
                te.abb_india,
                te.omnion,
                te.rinnai,
                te.oshkosh,
                te.polaris,
                te.volvo,
                te.bridgestone,
                te.wartsila_uk,
                te.mtu,
                te.mhi,
                te.free_hours,
                te.non_billable_hours,
                te.training_hours,
                te.remarks,
                te.available_hours,
                te.created_at
            FROM users u
            LEFT JOIN time_entries te ON u.id = te.user_id
            ORDER BY u.name, te.date DESC
        `;

        db.all(query, (err, rows) => {
            if (err) {
                console.error('Error fetching data for export:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            // Add data rows
            rows.forEach(row => {
                const dataRow = worksheet.addRow(row);

                // Color code available hours
                if (row.available_hours < 0) {
                    dataRow.getCell('available_hours').fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFCCCC' }
                    };
                    dataRow.getCell('available_hours').font = { color: { argb: 'FFCC0000' }, bold: true };
                }
            });

            // Set response headers for file download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=time_entries_export.xlsx');

            // Write to response
            workbook.xlsx.write(res)
                .then(() => {
                    res.end();
                })
                .catch(error => {
                    console.error('Error writing Excel file:', error);
                    res.status(500).json({ success: false, message: 'Error generating Excel file' });
                });
        });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ success: false, message: 'Export failed' });
    }
});

// Get project-wise time distribution
app.get('/admin/project-distribution', (req, res) => {
    const userFilter = req.query.user;

    let query = `
        SELECT 
            u.name as user_name,
            u.ps_number,
            SUM(te.komatsu) as komatsu,
            SUM(te.brunswick) as brunswick,
            SUM(te.abb_india) as abb_india,
            SUM(te.omnion) as omnion,
            SUM(te.rinnai) as rinnai,
            SUM(te.oshkosh) as oshkosh,
            SUM(te.polaris) as polaris,
            SUM(te.volvo) as volvo,
            SUM(te.bridgestone) as bridgestone,
            SUM(te.wartsila_uk) as wartsila_uk,
            SUM(te.mtu) as mtu,
            SUM(te.mhi) as mhi,
            SUM(te.free_hours) as free_hours,
            SUM(te.non_billable_hours) as non_billable,
            SUM(te.training_hours) as training,
            COUNT(te.id) as entry_count
        FROM users u
        LEFT JOIN time_entries te ON u.id = te.user_id
    `;

    let params = [];

    if (userFilter) {
        query += ` WHERE u.ps_number = ?`;
        params.push(userFilter);
    }

    query += ` GROUP BY u.id, u.name, u.ps_number ORDER BY u.name`;

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error fetching project distribution:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, distribution: rows });
    });
});

// Existing routes (keep all your existing routes below)
// Registration endpoint
app.post('/register', async (req, res) => {
    const { ps_number, password, name } = req.body;
    console.log('Registration attempt:', { ps_number, name });

    if (!ps_number || !password || !name) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        db.get('SELECT * FROM users WHERE ps_number = ?', [ps_number], async (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (row) {
                return res.status(400).json({ success: false, message: 'User already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            db.run('INSERT INTO users (ps_number, password, name) VALUES (?, ?, ?)',
                [ps_number, hashedPassword, name],
                function (err) {
                    if (err) {
                        console.error('Insert error:', err);
                        return res.status(500).json({ success: false, message: 'Registration failed' });
                    }
                    console.log('✅ User registered successfully - ID:', this.lastID);
                    res.json({ success: true, message: 'Registration successful' });
                }
            );
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Login endpoint
app.post('/login', (req, res) => {
    const { ps_number, password } = req.body;
    console.log('Login attempt:', ps_number);

    if (!ps_number || !password) {
        return res.status(400).json({ success: false, message: 'PS Number and password are required' });
    }

    db.get('SELECT * FROM users WHERE ps_number = ?', [ps_number], async (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!row) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, row.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: row.id,
                name: row.name,
                ps_number: row.ps_number
            }
        });
    });
});

// Save time entry
app.post('/save-time-entry', (req, res) => {
    const {
        userId,
        date,
        komatsu,
        brunswick,
        abb_india,
        omnion,
        rinnai,
        oshkosh,
        polaris,
        volvo,
        bridgestone,
        wartsila_uk,
        mtu,
        mhi,
        free_hours,
        non_billable_hours,
        training_hours,
        remarks
    } = req.body;

    console.log('💾 Saving time entry for user:', userId, 'date:', date);

    // Calculate total hours
    const billableHours =
        parseFloat(komatsu || 0) +
        parseFloat(brunswick || 0) +
        parseFloat(abb_india || 0) +
        parseFloat(omnion || 0) +
        parseFloat(rinnai || 0) +
        parseFloat(oshkosh || 0) +
        parseFloat(polaris || 0) +
        parseFloat(volvo || 0) +
        parseFloat(bridgestone || 0) +
        parseFloat(wartsila_uk || 0) +
        parseFloat(mtu || 0) +
        parseFloat(mhi || 0);

    const totalHours =
        billableHours +
        parseFloat(free_hours || 0) +
        parseFloat(non_billable_hours || 0) +
        parseFloat(training_hours || 0);

    // Calculate available hours - no negative values
    let availableHours;
    if (totalHours <= 9.5) {
        availableHours = 9.5 - totalHours;
    } else {
        // When total hours exceed 9.5: available = 19 - totalHours
        availableHours = Math.max(0, 19 - totalHours);
    }

    const query = `
        INSERT OR REPLACE INTO time_entries (
            user_id, date, komatsu, brunswick, abb_india, omnion, rinnai, oshkosh, 
            polaris, volvo, bridgestone, wartsila_uk, mtu, mhi, free_hours, 
            non_billable_hours, training_hours, remarks, available_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        userId, date,
        komatsu || 0, brunswick || 0, abb_india || 0, omnion || 0,
        rinnai || 0, oshkosh || 0, polaris || 0, volvo || 0,
        bridgestone || 0, wartsila_uk || 0, mtu || 0, mhi || 0,
        free_hours || 0, non_billable_hours || 0, training_hours || 0,
        remarks || '', availableHours
    ];

    db.run(query, params, function (err) {
        if (err) {
            console.error('❌ Error saving time entry:', err.message);
            return res.status(500).json({ success: false, message: 'Failed to save time entry: ' + err.message });
        }

        console.log('✅ Time entry saved/updated - ID:', this.lastID);
        res.json({
            success: true,
            message: 'Time entry saved successfully',
            available_hours: availableHours
        });
    });
});

// Get time entries for a user
app.get('/time-entries/:userId', (req, res) => {
    const userId = req.params.userId;

    db.all('SELECT * FROM time_entries WHERE user_id = ? ORDER BY date DESC', [userId], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching time entries:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, entries: rows });
    });
});

// Get specific time entry for editing
app.get('/time-entry/:userId/:date', (req, res) => {
    const { userId, date } = req.params;

    db.get('SELECT * FROM time_entries WHERE user_id = ? AND date = ?', [userId, date], (err, row) => {
        if (err) {
            console.error('❌ Error fetching time entry:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, entry: row || {} });
    });
});

// Start server with dynamic port allocation
let server;

async function startServer() {
    try {
        const availablePort = await findAvailablePort(PORT, PORT + 100);
        
        server = app.listen(availablePort, '0.0.0.0', () => {
            console.log(`🚀 Server running on:`);
            console.log(`   Local: http://localhost:${availablePort}`);
            console.log(`   Network: http://${LOCAL_IP}:${availablePort}`);
            console.log(`   Any IP: http://0.0.0.0:${availablePort}`);
            console.log('✅ Time tracking system ready');
            console.log(`👑 Admin panel: http://${LOCAL_IP}:${availablePort}/admin (Password: admin123)`);
            console.log(`🌐 Share this URL: http://${LOCAL_IP}:${availablePort}`);
            
            // Create a nice shareable link display
            console.log('\n📋 Shareable Links:');
            console.log('═'.repeat(50));
            console.log(`🔗 Main Application: http://${LOCAL_IP}:${availablePort}`);
            console.log(`⚙️  Admin Panel: http://${LOCAL_IP}:${availablePort}/admin`);
            console.log('═'.repeat(50));
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down server...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer();