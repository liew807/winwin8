// server.js - 完全调试版
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 数据库
let pool;
let useDatabase = false;

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    useDatabase = true;
    console.log('✅ 使用PostgreSQL数据库');
} else {
    console.log('📁 使用文件存储');
}

// ========== 初始化数据库 ==========
async function initDB() {
    if (!useDatabase) return;
    
    try {
        // 用户表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 商品表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                description TEXT,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 订单表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(50) UNIQUE NOT NULL,
                user_id INTEGER,
                product_id INTEGER,
                product_name VARCHAR(200) NOT NULL,
                product_price DECIMAL(10, 2) NOT NULL,
                total_amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 设置表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_name VARCHAR(200) DEFAULT 'CPMCY商城',
                kuaishou_link TEXT,
                contact_info TEXT,
                welcome_message TEXT
            )
        `);
        
        // 创建默认管理员
        const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await pool.query(`
                INSERT INTO users (username, password, is_admin)
                VALUES ($1, $2, $3)
            `, ['admin', hashedPassword, true]);
            console.log('✅ 创建管理员: admin / admin123');
        }
        
        // 默认设置
        const settingsCheck = await pool.query('SELECT COUNT(*) FROM settings');
        if (parseInt(settingsCheck.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message)
                VALUES ($1, $2, $3, $4)
            `, [
                'CPMCY商城',
                'https://v.kuaishou.com/JGv00n48',
                'FB账号GH Tree',
                '欢迎选购！点击购买扫码完成付款'
            ]);
        }
        
        // 添加示例商品（如果没有商品）
        const productsCheck = await pool.query('SELECT COUNT(*) FROM products');
        if (parseInt(productsCheck.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO products (name, price, description, image_url)
                VALUES 
                ('测试商品1', 99.99, '这是一个测试商品', 'https://via.placeholder.com/300x200?text=商品1'),
                ('测试商品2', 199.99, '这是另一个测试商品', 'https://via.placeholder.com/300x200?text=商品2')
            `);
            console.log('✅ 添加了2个示例商品');
        }
        
        console.log('✅ 数据库初始化完成');
    } catch (error) {
        console.log('数据库初始化错误:', error.message);
    }
}

// ========== 文件存储 ==========
const dataFile = path.join(__dirname, 'data.json');

async function getFileData() {
    if (useDatabase) return null;
    
    try {
        await fs.access(dataFile);
        const data = await fs.readFile(dataFile, 'utf8');
        return JSON.parse(data);
    } catch {
        const defaultData = {
            users: [{ 
                id: 1,
                username: 'admin', 
                password: bcrypt.hashSync('admin123', 10), 
                isAdmin: true,
                is_admin: true 
            }],
            products: [
                {
                    id: 1,
                    name: '测试商品1',
                    price: 99.99,
                    description: '这是一个测试商品',
                    image_url: 'https://via.placeholder.com/300x200?text=商品1',
                    image: 'https://via.placeholder.com/300x200?text=商品1',
                    created_at: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                },
                {
                    id: 2,
                    name: '测试商品2',
                    price: 199.99,
                    description: '这是另一个测试商品',
                    image_url: 'https://via.placeholder.com/300x200?text=商品2',
                    image: 'https://via.placeholder.com/300x200?text=商品2',
                    created_at: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                }
            ],
            orders: [],
            settings: {
                storeName: 'CPMCY商城',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                contactInfo: 'FB账号GH Tree',
                welcomeMessage: '欢迎选购！点击购买扫码完成付款'
            }
        };
        await fs.writeFile(dataFile, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

async function saveFileData(data) {
    if (useDatabase) return false;
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
    return true;
}

// ========== 商品功能 ==========
async function getProducts() {
    try {
        if (useDatabase) {
            const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
            console.log(`✅ 加载 ${result.rows.length} 个商品`);
            // 确保字段名兼容
            return result.rows.map(product => ({
                id: product.id,
                name: product.name,
                price: product.price,
                description: product.description,
                image: product.image_url,
                image_url: product.image_url,
                createdAt: product.created_at,
                created_at: product.created_at
            }));
        } else {
            const data = await getFileData();
            console.log(`✅ 加载 ${data.products.length} 个商品`);
            return data.products || [];
        }
    } catch (error) {
        console.error('加载商品失败:', error);
        return [];
    }
}

async function addProduct(product) {
    try {
        console.log('📦 添加商品:', product);
        
        if (useDatabase) {
            const price = parseFloat(product.price) || 0;
            const result = await pool.query(`
                INSERT INTO products (name, price, description, image_url)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [
                product.name || '',
                price,
                product.description || '',
                product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品'
            ]);
            
            const savedProduct = result.rows[0];
            // 返回兼容格式
            return {
                id: savedProduct.id,
                name: savedProduct.name,
                price: savedProduct.price,
                description: savedProduct.description,
                image: savedProduct.image_url,
                image_url: savedProduct.image_url,
                createdAt: savedProduct.created_at,
                created_at: savedProduct.created_at
            };
        } else {
            const data = await getFileData();
            const newProduct = {
                id: Date.now(),
                name: product.name || '',
                price: parseFloat(product.price) || 0,
                description: product.description || '',
                image: product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品',
                image_url: product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品',
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            data.products.push(newProduct);
            await saveFileData(data);
            return newProduct;
        }
    } catch (error) {
        console.error('添加商品失败:', error);
        return null;
    }
}

async function deleteProduct(id) {
    try {
        if (useDatabase) {
            await pool.query('DELETE FROM products WHERE id = $1', [id]);
        } else {
            const data = await getFileData();
            data.products = data.products.filter(p => p.id != id);
            await saveFileData(data);
        }
        return true;
    } catch (error) {
        console.error('删除商品失败:', error);
        return false;
    }
}

// ========== 订单功能 ==========
async function getOrders() {
    try {
        if (useDatabase) {
            const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
            return result.rows;
        } else {
            const data = await getFileData();
            return data.orders || [];
        }
    } catch (error) {
        console.error('加载订单失败:', error);
        return [];
    }
}

async function addOrder(order) {
    try {
        console.log('📦 创建订单:', order);
        
        if (useDatabase) {
            const result = await pool.query(`
                INSERT INTO orders (
                    order_number, user_id, product_id, product_name, 
                    product_price, total_amount, payment_method, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                order.orderNumber || ('DD' + Date.now().toString().slice(-8)),
                order.userId || 'guest',
                order.productId || 0,
                order.productName || '',
                order.productPrice || 0,
                order.totalAmount || 0,
                order.paymentMethod || 'tng',
                order.status || 'pending'
            ]);
            return result.rows[0];
        } else {
            const data = await getFileData();
            const newOrder = {
                id: Date.now(),
                orderNumber: order.orderNumber || ('DD' + Date.now().toString().slice(-8)),
                userId: order.userId || 'guest',
                productId: order.productId || 0,
                productName: order.productName || '',
                productPrice: order.productPrice || 0,
                totalAmount: order.totalAmount || 0,
                paymentMethod: order.paymentMethod || 'tng',
                status: order.status || 'pending',
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            data.orders.push(newOrder);
            await saveFileData(data);
            return newOrder;
        }
    } catch (error) {
        console.error('创建订单失败:', error);
        return null;
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        if (useDatabase) {
            await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        } else {
            const data = await getFileData();
            const order = data.orders.find(o => o.id == orderId);
            if (order) {
                order.status = status;
                await saveFileData(data);
            }
        }
        return true;
    } catch (error) {
        console.error('更新订单状态失败:', error);
        return false;
    }
}

// ========== 用户功能 ==========
async function authenticateUser(username, password) {
    try {
        console.log(`🔐 用户登录: ${username}`);
        
        if (useDatabase) {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) {
                console.log('❌ 用户不存在');
                return null;
            }
            
            const user = result.rows[0];
            // 使用同步比较
            const isValid = bcrypt.compareSync(password, user.password);
            
            if (!isValid) {
                console.log('❌ 密码错误');
                return null;
            }
            
            console.log('✅ 登录成功');
            return {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                is_admin: user.is_admin,
                createdAt: user.created_at
            };
        } else {
            const data = await getFileData();
            const user = data.users.find(u => u.username === username);
            if (!user || !bcrypt.compareSync(password, user.password)) return null;
            
            return {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin || user.is_admin,
                is_admin: user.isAdmin || user.is_admin
            };
        }
    } catch (error) {
        console.error('用户认证失败:', error);
        return null;
    }
}

async function registerUser(username, password) {
    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        if (useDatabase) {
            try {
                const result = await pool.query(`
                    INSERT INTO users (username, password, is_admin)
                    VALUES ($1, $2, $3)
                    RETURNING *
                `, [username, hashedPassword, false]);
                
                return {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    isAdmin: false,
                    is_admin: false
                };
            } catch (error) {
                if (error.code === '23505') return null; // 用户名已存在
                throw error;
            }
        } else {
            const data = await getFileData();
            const userExists = data.users.some(u => u.username === username);
            if (userExists) return null;
            
            const newUser = {
                id: Date.now(),
                username,
                password: hashedPassword,
                isAdmin: false,
                is_admin: false
            };
            data.users.push(newUser);
            await saveFileData(data);
            return newUser;
        }
    } catch (error) {
        console.error('注册失败:', error);
        return null;
    }
}

// ========== 设置功能 ==========
async function getSettings() {
    try {
        if (useDatabase) {
            const result = await pool.query('SELECT * FROM settings LIMIT 1');
            return result.rows[0] || {};
        } else {
            const data = await getFileData();
            return data.settings || {};
        }
    } catch (error) {
        return {};
    }
}

async function updateSettings(settings) {
    try {
        if (useDatabase) {
            const existing = await getSettings();
            if (existing.id) {
                await pool.query(`
                    UPDATE settings 
                    SET store_name = $1, kuaishou_link = $2, 
                        contact_info = $3, welcome_message = $4
                    WHERE id = $5
                `, [
                    settings.storeName || existing.store_name,
                    settings.kuaishouLink || existing.kuaishou_link,
                    settings.contactInfo || existing.contact_info,
                    settings.welcomeMessage || existing.welcome_message,
                    existing.id
                ]);
            } else {
                await pool.query(`
                    INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message)
                    VALUES ($1, $2, $3, $4)
                `, [
                    settings.storeName || 'CPMCY商城',
                    settings.kuaishouLink || '',
                    settings.contactInfo || '',
                    settings.welcomeMessage || ''
                ]);
            }
        } else {
            const data = await getFileData();
            data.settings = { ...data.settings, ...settings };
            await saveFileData(data);
        }
        return true;
    } catch (error) {
        console.error('更新设置失败:', error);
        return false;
    }
}

// ========== API路由 ==========

// 1. 商品API
app.get('/api/products', async (req, res) => {
    try {
        const products = await getProducts();
        console.log(`📦 API返回 ${products.length} 个商品`);
        res.json({ 
            success: true, 
            data: products,
            message: `加载了 ${products.length} 个商品`
        });
    } catch (error) {
        console.error('API获取商品失败:', error);
        res.json({ success: true, data: [] });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        console.log('📦 API添加商品:', req.body);
        const product = req.body;
        const saved = await addProduct(product);
        
        if (saved) {
            res.json({ 
                success: true, 
                data: saved,
                message: '商品添加成功'
            });
        } else {
            res.json({ 
                success: false, 
                error: '添加商品失败'
            });
        }
    } catch (error) {
        console.error('API添加商品失败:', error);
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await deleteProduct(req.params.id);
        res.json({ success: true, message: '商品删除成功' });
    } catch (error) {
        res.json({ success: false });
    }
});

// 2. 订单API
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json({ success: true, data: orders });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        const saved = await addOrder(order);
        res.json({ success: true, data: saved });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await updateOrderStatus(id, status);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// 3. 用户API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 API登录请求: ${username}`);
        
        const user = await authenticateUser(username, password);
        
        if (user) {
            res.json({ 
                success: true, 
                data: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.isAdmin || user.is_admin,
                    is_admin: user.isAdmin || user.is_admin
                },
                message: '登录成功'
            });
        } else {
            res.json({ 
                success: false, 
                error: '用户名或密码错误',
                message: '默认管理员: admin / admin123'
            });
        }
    } catch (error) {
        console.error('API登录失败:', error);
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await registerUser(username, password);
        
        if (user) {
            res.json({ 
                success: true, 
                data: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.isAdmin,
                    is_admin: user.is_admin
                }
            });
        } else {
            res.json({ success: false, error: '用户名已存在' });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// 4. 设置API
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({ 
            success: true, 
            data: {
                storeName: settings.store_name || settings.storeName || 'CPMCY商城',
                kuaishouLink: settings.kuaishou_link || settings.kuaishouLink || 'https://v.kuaishou.com/JGv00n48',
                contactInfo: settings.contact_info || settings.contactInfo || 'FB账号GH Tree',
                welcomeMessage: settings.welcome_message || settings.welcomeMessage || '欢迎选购！点击购买扫码完成付款'
            }
        });
    } catch (error) {
        res.json({ success: true, data: {
            storeName: 'CPMCY商城',
            kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
            contactInfo: 'FB账号GH Tree',
            welcomeMessage: '欢迎选购！点击购买扫码完成付款'
        }});
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        await updateSettings(settings);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// 5. 数据统计API
app.get('/api/stats', async (req, res) => {
    try {
        const [products, orders] = await Promise.all([
            getProducts(),
            getOrders()
        ]);
        
        const today = new Date().toDateString();
        const todayOrders = orders.filter(order => 
            new Date(order.createdAt || order.created_at).toDateString() === today
        );
        
        res.json({
            success: true,
            data: {
                totalProducts: products.length,
                totalOrders: orders.length,
                todayOrders: todayOrders.length,
                pendingOrders: orders.filter(o => o.status === 'pending').length,
                paidOrders: orders.filter(o => o.status === 'paid').length,
                completedOrders: orders.filter(o => o.status === 'completed').length
            }
        });
    } catch (error) {
        res.json({ success: true, data: {} });
    }
});

// 6. 系统状态API
app.get('/api/status', async (req, res) => {
    try {
        const products = await getProducts();
        res.json({
            success: true,
            data: {
                status: 'running',
                storageType: useDatabase ? 'postgresql' : 'file',
                productsCount: products.length,
                port: PORT
            }
        });
    } catch (error) {
        res.json({ success: true, data: { status: 'running' } });
    }
});

// 7. 备份API
app.get('/api/backup', async (req, res) => {
    try {
        const [products, orders] = await Promise.all([
            getProducts(),
            getOrders()
        ]);
        
        const settings = await getSettings();
        
        const backupData = {
            products,
            orders,
            settings,
            backupAt: new Date().toISOString()
        };
        
        res.setHeader('Content-Disposition', 'attachment; filename="cpmcy-backup.json"');
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ========== 测试路由 ==========
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        storage: useDatabase ? 'database' : 'file'
    });
});

// ========== 根路由 ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.send(`
                <html>
                    <body style="font-family: Arial; padding: 50px; text-align: center;">
                        <h1>🚀 CPMCY商城后端运行中</h1>
                        <p>端口: ${PORT}</p>
                        <p>存储模式: ${useDatabase ? 'PostgreSQL数据库' : '本地文件'}</p>
                        <p>默认管理员: admin / admin123</p>
                        <p><a href="/api/test">测试API连接</a></p>
                        <p><a href="/api/products">查看商品列表</a></p>
                    </body>
                </html>
            `);
        }
    });
});

// ========== 启动服务器 ==========
async function startServer() {
    if (useDatabase) {
        await initDB();
    }
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城已启动！
        📍 端口: ${PORT}
        📍 存储: ${useDatabase ? 'PostgreSQL数据库' : '本地文件'}
        📍 地址: http://localhost:${PORT}/
        
        ✅ 功能列表:
        - 商品管理（添加、删除、查看）
        - 订单管理（创建、状态更新、查看）
        - 用户系统（登录、注册）
        - 系统设置
        - 数据统计
        
        默认管理员: admin / admin123
        
        🔗 测试链接:
        - http://localhost:${PORT}/api/test
        - http://localhost:${PORT}/api/products
        `);
    });
}

startServer().catch(console.error);
