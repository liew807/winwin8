// server.js - 完整修复版
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// ========== 环境变量验证 ==========
console.log('🔍 环境检查:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '已设置' : '未设置');

if (!process.env.DATABASE_URL) {
    console.warn('⚠️  警告: DATABASE_URL 环境变量未设置');
    console.warn('   在Render上需要设置DATABASE_URL');
    console.warn('   本地开发可以使用 .env 文件');
}

// ========== 中间件配置 ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 关键修复：添加静态文件服务 ==========
// 创建public目录（如果不存在）
const publicDir = path.join(__dirname, 'public');
fs.mkdir(publicDir, { recursive: true }).catch(console.error);

// 提供静态文件服务
app.use(express.static('public'));

// 更详细的静态文件配置
app.use(express.static(publicDir, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ========== PostgreSQL数据库配置 ==========
let pool;
let useDatabase = false;

try {
    if (process.env.DATABASE_URL) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { 
                rejectUnauthorized: false 
            } : false,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 20
        });
        
        // 测试连接
        pool.query('SELECT NOW()', (err, res) => {
            if (err) {
                console.error('❌ PostgreSQL连接失败:', err.message);
                useDatabase = false;
            } else {
                console.log('✅ PostgreSQL连接成功');
                console.log('- 数据库时间:', res.rows[0].now);
                useDatabase = true;
                initializeDatabaseTables();
            }
        });
    } else {
        console.log('ℹ️  未配置DATABASE_URL，使用文件存储');
        useDatabase = false;
    }
} catch (error) {
    console.error('❌ 数据库配置失败:', error.message);
    useDatabase = false;
}

// ========== 初始化数据库表 ==========
async function initializeDatabaseTables() {
    if (!useDatabase) return;
    
    try {
        console.log('📊 初始化数据库表...');
        
        // 用户表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 设置表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_name VARCHAR(200) DEFAULT 'CPMCY商城',
                kuaishou_link TEXT,
                contact_info TEXT,
                welcome_message TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 检查是否有管理员
        const adminCheck = await pool.query('SELECT COUNT(*) FROM users WHERE username = $1', ['admin']);
        if (parseInt(adminCheck.rows[0].count) === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await pool.query(`
                INSERT INTO users (username, password, is_admin)
                VALUES ($1, $2, $3)
            `, ['admin', hashedPassword, true]);
            console.log('✅ 创建默认管理员: admin / admin123');
        }
        
        // 检查默认设置
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
            console.log('✅ 创建默认设置');
        }
        
        console.log('✅ 数据库表初始化完成');
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
    }
}

// ========== 文件存储备份（当数据库不可用时）==========
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'mall-data.json');

async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        try {
            await fs.access(DATA_FILE);
        } catch {
            const initialData = {
                users: [
                    { 
                        username: 'admin', 
                        password: bcrypt.hashSync('admin123', 10),
                        isAdmin: true 
                    }
                ],
                products: [],
                orders: [],
                settings: {
                    storeName: 'CPMCY商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                    contactInfo: 'FB账号GH Tree',
                    welcomeMessage: '欢迎选购！点击购买扫码完成付款'
                },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ 数据文件初始化完成');
        }
    } catch (error) {
        console.error('❌ 初始化数据目录失败:', error);
    }
}

// 读取文件数据
async function readFileData() {
    try {
        if (!useDatabase) {
            await ensureDataDir();
            const data = await fs.readFile(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('❌ 读取数据失败:', error);
        return null;
    }
}

// 保存文件数据
async function saveFileData(data) {
    try {
        if (!useDatabase && data) {
            data.lastUpdated = new Date().toISOString();
            await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ 保存数据失败:', error);
        return false;
    }
}

// ========== 通用数据访问函数 ==========
async function getProducts() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
            console.log('📦 从数据库获取商品:', result.rows.length, '个');
            return result.rows;
        } catch (error) {
            console.error('获取商品失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        const products = data ? data.products : [];
        console.log('📦 从文件获取商品:', products.length, '个');
        return products;
    }
}

async function addProduct(product) {
    console.log('➕ 添加商品:', product);
    
    if (useDatabase) {
        try {
            const result = await pool.query(`
                INSERT INTO products (name, price, description, image_url)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [
                product.name,
                product.price,
                product.description || '',
                product.image || 'https://via.placeholder.com/300x200?text=商品'
            ]);
            console.log('✅ 商品已保存到数据库');
            return result.rows[0];
        } catch (error) {
            console.error('添加商品失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            product.id = Date.now();
            product.createdAt = new Date().toISOString();
            data.products.push(product);
            await saveFileData(data);
            console.log('✅ 商品已保存到文件');
            return product;
        }
        return null;
    }
}

async function deleteProduct(productId) {
    console.log('🗑️ 删除商品 ID:', productId);
    
    if (useDatabase) {
        try {
            const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [productId]);
            console.log('✅ 从数据库删除商品:', result.rowCount > 0);
            return result.rowCount > 0;
        } catch (error) {
            console.error('删除商品失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const index = data.products.findIndex(p => p.id == productId);
            if (index !== -1) {
                data.products.splice(index, 1);
                await saveFileData(data);
                console.log('✅ 从文件删除商品');
                return true;
            }
        }
        return false;
    }
}

async function getOrders() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
            return result.rows;
        } catch (error) {
            console.error('获取订单失败:', error);
            return [];
        }
    } else {
        const data = await readFileData();
        return data ? data.orders : [];
    }
}

async function addOrder(order) {
    if (useDatabase) {
        try {
            const result = await pool.query(`
                INSERT INTO orders (
                    order_number, user_id, product_id, product_name, 
                    product_price, total_amount, payment_method, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                order.orderNumber,
                order.userId,
                order.productId,
                order.productName,
                order.productPrice,
                order.totalAmount,
                order.paymentMethod || 'tng',
                order.status || 'pending'
            ]);
            return result.rows[0];
        } catch (error) {
            console.error('添加订单失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            order.id = Date.now();
            order.createdAt = new Date().toISOString();
            data.orders.push(order);
            await saveFileData(data);
            return order;
        }
        return null;
    }
}

async function updateOrderStatus(orderId, status) {
    if (useDatabase) {
        try {
            const result = await pool.query(`
                UPDATE orders 
                SET status = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2 
                RETURNING *
            `, [status, orderId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('更新订单状态失败:', error);
            return false;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const order = data.orders.find(o => o.id == orderId);
            if (order) {
                order.status = status;
                await saveFileData(data);
                return true;
            }
        }
        return false;
    }
}

async function authenticateUser(username, password) {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rowCount === 0) return null;
            
            const user = result.rows[0];
            const isValid = bcrypt.compareSync(password, user.password);
            
            if (!isValid) return null;
            
            return {
                id: user.id,
                username: user.username,
                password: user.password,
                isAdmin: user.is_admin || user.isAdmin || false,
                is_admin: user.is_admin || user.isAdmin || false,
                createdAt: user.created_at || user.createdAt,
                lastLogin: user.last_login || user.lastLogin
            };
        } catch (error) {
            console.error('用户认证失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const user = data.users.find(u => u.username === username);
            if (user) {
                const isValid = bcrypt.compareSync(password, user.password);
                if (!isValid) return null;
                
                return {
                    ...user,
                    isAdmin: user.isAdmin || user.is_admin || false,
                    is_admin: user.isAdmin || user.is_admin || false
                };
            }
        }
        return null;
    }
}

async function registerUser(username, password) {
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
                password: result.rows[0].password,
                isAdmin: result.rows[0].is_admin || false,
                is_admin: result.rows[0].is_admin || false
            };
        } catch (error) {
            console.error('注册用户失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            const userExists = data.users.some(u => u.username === username);
            if (userExists) return null;
            
            const newUser = {
                username,
                password: hashedPassword,
                isAdmin: false,
                is_admin: false
            };
            
            data.users.push(newUser);
            await saveFileData(data);
            return newUser;
        }
        return null;
    }
}

async function getSettings() {
    if (useDatabase) {
        try {
            const result = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
            return result.rowCount > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('获取设置失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        return data ? data.settings : null;
    }
}

async function updateSettings(settings) {
    if (useDatabase) {
        try {
            const existing = await getSettings();
            if (existing) {
                const result = await pool.query(`
                    UPDATE settings 
                    SET store_name = $1, kuaishou_link = $2, 
                        contact_info = $3, welcome_message = $4,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                `, [
                    settings.storeName || existing.store_name,
                    settings.kuaishouLink || existing.kuaishou_link,
                    settings.contactInfo || existing.contact_info,
                    settings.welcomeMessage || existing.welcome_message
                ]);
                return result.rows[0];
            } else {
                const result = await pool.query(`
                    INSERT INTO settings (store_name, kuaishou_link, contact_info, welcome_message)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `, [
                    settings.storeName || 'CPMCY商城',
                    settings.kuaishouLink || '',
                    settings.contactInfo || '',
                    settings.welcomeMessage || ''
                ]);
                return result.rows[0];
            }
        } catch (error) {
            console.error('更新设置失败:', error);
            return null;
        }
    } else {
        const data = await readFileData();
        if (data) {
            data.settings = {
                ...data.settings,
                ...settings
            };
            await saveFileData(data);
            return data.settings;
        }
        return null;
    }
}

// ========== 修复：创建默认的前端文件 ==========
async function createDefaultIndexHtml() {
    try {
        const indexPath = path.join(publicDir, 'index.html');
        
        // 检查index.html是否存在
        try {
            await fs.access(indexPath);
            console.log('✅ index.html 已存在');
            return;
        } catch {
            // 文件不存在，创建它
            console.log('📝 创建默认 index.html');
            
            const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CPMCY商城</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            text-align: center; 
        }
        .header { 
            background: #667eea; 
            color: white; 
            padding: 20px; 
            border-radius: 10px; 
            margin-bottom: 30px; 
        }
        .login-box { 
            background: #f5f5f5; 
            padding: 30px; 
            border-radius: 10px; 
            margin: 50px auto; 
            max-width: 400px; 
        }
        input { 
            width: 100%; 
            padding: 12px; 
            margin: 10px 0; 
            border: 1px solid #ddd; 
            border-radius: 5px; 
        }
        button { 
            width: 100%; 
            padding: 12px; 
            background: #667eea; 
            color: white; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer; 
            margin-top: 10px; 
        }
        .message { 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 5px; 
        }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .products-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-top: 20px; 
        }
        .product-card { 
            border: 1px solid #ddd; 
            border-radius: 10px; 
            padding: 15px; 
            text-align: left; 
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="header">
            <h1>🚀 CPMCY商城</h1>
            <p>后端运行正常，前端页面加载中...</p>
        </div>
        
        <div id="loginSection">
            <div class="login-box">
                <h2>登录</h2>
                <input type="text" id="username" placeholder="用户名">
                <input type="password" id="password" placeholder="密码">
                <button onclick="login()">登录</button>
                <p style="margin-top: 15px; color: #666;">
                    默认管理员: admin / admin123
                </p>
            </div>
        </div>
        
        <div id="storeSection" style="display: none;">
            <div style="text-align: right; margin-bottom: 20px;">
                <span id="currentUser"></span>
                <button onclick="logout()" style="margin-left: 10px; width: auto;">退出</button>
            </div>
            
            <h2>商品列表</h2>
            <div id="productsList" class="products-grid">
                <!-- 商品动态加载 -->
            </div>
            
            <div style="margin-top: 50px; padding: 20px; background: #f5f5f5; border-radius: 10px;">
                <h3>API状态</h3>
                <p>后端API运行正常！</p>
                <p>存储模式: <span id="storageMode">正在检测...</span></p>
                <button onclick="testAPI()">测试API连接</button>
            </div>
        </div>
        
        <div id="message" class="message"></div>
    </div>

    <script>
        // 测试API连接
        async function testAPI() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('storageMode').textContent = 
                        data.data.storageType === 'postgresql' ? 'PostgreSQL数据库' : '本地文件';
                    showMessage('✅ API连接正常！', 'success');
                } else {
                    showMessage('❌ API连接失败', 'error');
                }
            } catch (error) {
                showMessage('❌ 无法连接到API', 'error');
            }
        }
        
        // 登录函数
        async function login() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    localStorage.setItem('user', JSON.stringify(data.data));
                    document.getElementById('currentUser').textContent = '用户: ' + data.data.username;
                    document.getElementById('loginSection').style.display = 'none';
                    document.getElementById('storeSection').style.display = 'block';
                    loadProducts();
                    showMessage('登录成功！', 'success');
                } else {
                    showMessage(data.error || '登录失败', 'error');
                }
            } catch (error) {
                showMessage('网络错误: ' + error.message, 'error');
            }
        }
        
        // 加载商品
        async function loadProducts() {
            try {
                const response = await fetch('/api/products');
                const data = await response.json();
                
                if (data.success) {
                    const container = document.getElementById('productsList');
                    
                    if (data.data.length === 0) {
                        container.innerHTML = '<p>暂无商品</p>';
                        return;
                    }
                    
                    container.innerHTML = data.data.map(product => \`
                        <div class="product-card">
                            <h3>\${product.name}</h3>
                            <p>价格: ¥\${product.price}</p>
                            <p>\${product.description || ''}</p>
                        </div>
                    \`).join('');
                    
                    showMessage(\`已加载 \${data.data.length} 个商品\`, 'success');
                }
            } catch (error) {
                console.error('加载商品失败:', error);
            }
        }
        
        // 显示消息
        function showMessage(text, type) {
            const msgEl = document.getElementById('message');
            msgEl.textContent = text;
            msgEl.className = 'message ' + type;
            msgEl.style.display = 'block';
            
            setTimeout(() => {
                msgEl.style.display = 'none';
            }, 3000);
        }
        
        // 退出登录
        function logout() {
            localStorage.removeItem('user');
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('storeSection').style.display = 'none';
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            showMessage('已退出登录', 'success');
        }
        
        // 页面加载时检查登录状态
        window.onload = function() {
            testAPI();
            
            const savedUser = localStorage.getItem('user');
            if (savedUser) {
                const user = JSON.parse(savedUser);
                document.getElementById('currentUser').textContent = '用户: ' + user.username;
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('storeSection').style.display = 'block';
                loadProducts();
            }
        };
    </script>
</body>
</html>`;
            
            await fs.writeFile(indexPath, htmlContent);
            console.log('✅ 默认 index.html 创建完成');
        }
    } catch (error) {
        console.error('创建默认HTML失败:', error);
    }
}

// ========== 修复根路由 - 直接发送前端页面 ==========
app.get('/', (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    
    // 直接发送HTML文件
    res.sendFile(indexPath, (err) => {
        if (err) {
            // 如果HTML文件不存在，显示API文档
            console.log('❌ 找不到前端页面，显示API文档');
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>CPMCY商城</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 50px; text-align: center; }
                        h1 { color: #333; }
                        .box { background: #f5f5f5; padding: 30px; border-radius: 10px; margin: 20px auto; max-width: 800px; }
                        .endpoint { background: white; padding: 10px; margin: 5px 0; border-radius: 5px; text-align: left; }
                        .method { display: inline-block; padding: 3px 8px; border-radius: 3px; margin-right: 10px; font-weight: bold; }
                        .get { background: #61affe; color: white; }
                        .post { background: #49cc90; color: white; }
                        .put { background: #fca130; color: white; }
                        .delete { background: #f93e3e; color: white; }
                        .info { background: #905df1; color: white; }
                    </style>
                </head>
                <body>
                    <h1>🚀 CPMCY商城后端运行正常！</h1>
                    <div class="box">
                        <h2>${useDatabase ? '✅ PostgreSQL数据库版' : '📁 文件存储版'}</h2>
                        <p>${useDatabase ? '所有数据存储在PostgreSQL数据库中' : '数据存储在本地文件中（适合开发）'}</p>
                        
                        <div class="endpoint">
                            <span class="method info">ℹ️</span>
                            <strong>存储模式:</strong> ${useDatabase ? 'PostgreSQL数据库' : '本地文件'}
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/products</strong> - 获取商品列表
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/products</strong> - 添加商品
                        </div>
                        
                        <div class="endpoint">
                            <span class="method delete">DELETE</span>
                            <strong>/api/products/:id</strong> - 删除商品
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/orders</strong> - 获取订单列表
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/orders</strong> - 创建订单
                        </div>
                        
                        <div class="endpoint">
                            <span class="method put">PUT</span>
                            <strong>/api/orders/:id/status</strong> - 更新订单状态
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/login</strong> - 用户登录
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/register</strong> - 用户注册
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/settings</strong> - 获取系统设置
                        </div>
                        
                        <div class="endpoint">
                            <span class="method put">PUT</span>
                            <strong>/api/settings</strong> - 更新系统设置
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/backup</strong> - 备份数据
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/stats</strong> - 数据统计
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/status</strong> - 系统状态
                        </div>
                        
                        <p style="margin-top: 20px; color: #ff4444;">
                            <strong>⚠️ 警告：</strong> 前端页面不存在，请确保public/index.html文件存在
                        </p>
                    </div>
                </body>
                </html>
            `);
        } else {
            console.log('✅ 发送前端页面');
        }
    });
});

// ========== API路由（添加调试日志）==========

// 1. 商品API
app.get('/api/products', async (req, res) => {
    try {
        console.log('📡 API请求: GET /api/products');
        const products = await getProducts();
        res.json({
            success: true,
            data: products,
            message: `获取到 ${products.length} 个商品`
        });
    } catch (error) {
        console.error('获取商品失败:', error);
        res.status(500).json({ success: false, error: '获取商品失败: ' + error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        console.log('📡 API请求: POST /api/products', req.body);
        
        // 验证数据
        const product = req.body;
        if (!product.name || !product.price) {
            return res.status(400).json({ success: false, error: '商品名称和价格是必填项' });
        }
        
        const savedProduct = await addProduct(product);
        
        if (savedProduct) {
            console.log('✅ 商品添加成功:', savedProduct);
            res.json({
                success: true,
                data: savedProduct,
                message: '商品添加成功'
            });
        } else {
            res.status(500).json({ success: false, error: '添加商品失败' });
        }
    } catch (error) {
        console.error('添加商品失败:', error);
        res.status(500).json({ success: false, error: '添加商品失败: ' + error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('📡 API请求: DELETE /api/products/' + id);
        
        const success = await deleteProduct(id);
        
        if (success) {
            res.json({ success: true, message: '商品删除成功' });
        } else {
            res.status(404).json({ success: false, error: '商品不存在' });
        }
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 2. 订单API
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        
        // 生成订单号（如果没有提供）
        if (!order.orderNumber) {
            const now = new Date();
            order.orderNumber = 'DD' + now.getTime().toString().slice(-8);
        }
        
        const savedOrder = await addOrder(order);
        
        if (savedOrder) {
            res.json({
                success: true,
                data: savedOrder,
                message: '订单创建成功'
            });
        } else {
            res.status(500).json({ success: false, error: '创建订单失败' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '创建订单失败' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const success = await updateOrderStatus(id, status);
        
        if (success) {
            res.json({
                success: true,
                message: '订单状态更新成功'
            });
        } else {
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单状态失败' });
    }
});

// 3. 用户API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('🔐 用户登录尝试:', username);
        
        const user = await authenticateUser(username, password);
        
        if (user) {
            const userWithoutPassword = {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin || user.is_admin || false,
                createdAt: user.createdAt || user.created_at,
                lastLogin: user.lastLogin || user.last_login
            };
            
            console.log(`✅ 用户登录成功: ${username}, 管理员: ${userWithoutPassword.isAdmin}`);
            
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            console.log('❌ 登录失败: 用户名或密码错误');
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: '密码长度至少6位' });
        }
        
        const user = await registerUser(username, password);
        
        if (user) {
            const { password: _, ...userWithoutPassword } = user;
            
            userWithoutPassword.isAdmin = user.isAdmin || false;
            
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '注册成功'
            });
        } else {
            res.status(400).json({ success: false, error: '用户名已存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 4. 系统设置API
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await getSettings();
        
        if (settings) {
            const formattedSettings = {
                storeName: settings.store_name || settings.storeName || 'CPMCY商城',
                kuaishouLink: settings.kuaishou_link || settings.kuaishouLink || '',
                contactInfo: settings.contact_info || settings.contactInfo || '',
                welcomeMessage: settings.welcome_message || settings.welcomeMessage || ''
            };
            
            res.json({
                success: true,
                data: formattedSettings
            });
        } else {
            res.json({
                success: true,
                data: {
                    storeName: 'CPMCY商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                    contactInfo: 'FB账号GH Tree',
                    welcomeMessage: '欢迎选购！点击购买扫码完成付款'
                }
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        const updated = await updateSettings(settings);
        
        if (updated) {
            res.json({
                success: true,
                data: updated,
                message: '设置更新成功'
            });
        } else {
            res.status(500).json({ success: false, error: '更新设置失败' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
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
        
        const stats = {
            totalProducts: products.length,
            totalOrders: orders.length,
            todayOrders: todayOrders.length,
            todayRevenue: todayOrders.reduce((sum, order) => sum + (order.totalAmount || order.total_amount || 0), 0),
            pendingOrders: orders.filter(o => (o.status || 'pending') === 'pending').length,
            paidOrders: orders.filter(o => (o.status || 'pending') === 'paid').length,
            completedOrders: orders.filter(o => (o.status || 'pending') === 'completed').length,
            storageType: useDatabase ? 'postgresql' : 'file',
            lastUpdated: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取统计失败' });
    }
});

// 6. 系统状态API
app.get('/api/status', async (req, res) => {
    try {
        const [products, orders] = await Promise.all([
            getProducts(),
            getOrders()
        ]);
        
        let dbStatus = 'unknown';
        if (useDatabase) {
            try {
                await pool.query('SELECT 1');
                dbStatus = 'connected';
            } catch {
                dbStatus = 'disconnected';
            }
        }
        
        res.json({
            success: true,
            data: {
                status: 'running',
                serverTime: new Date().toISOString(),
                uptime: process.uptime(),
                port: PORT,
                storageType: useDatabase ? 'postgresql' : 'file',
                databaseStatus: dbStatus,
                productsCount: products.length,
                ordersCount: orders.length,
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// 7. 备份数据API
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
            settings: settings || {},
            backupAt: new Date().toISOString(),
            backupVersion: '2.0',
            note: 'CPMCY商城数据备份',
            storageType: useDatabase ? 'postgresql' : 'file'
        };
        
        res.setHeader('Content-Disposition', 'attachment; filename="cpmcy-backup.json"');
        res.setHeader('Content-Type', 'application/json');
        
        res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, error: '备份失败' });
    }
});

// ========== 404处理 ==========
app.use((req, res) => {
    console.log('❌ 404: ', req.method, req.url);
    res.status(404).json({ success: false, error: '接口不存在' });
});

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

// ========== 启动服务器 ==========
async function startServer() {
    if (!useDatabase) {
        await ensureDataDir();
    }
    
    // 创建默认的前端文件
    await createDefaultIndexHtml();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城后端已启动！
        📍 端口: ${PORT}
        📍 存储模式: ${useDatabase ? 'PostgreSQL数据库' : '本地文件存储'}
        📍 环境: ${process.env.NODE_ENV || 'development'}
        
        ${useDatabase ? '' : 'ℹ️  提示: 要使用PostgreSQL，请设置DATABASE_URL环境变量'}
        
        ✅ 前端商城: http://localhost:${PORT}/
        ✅ API文档: http://localhost:${PORT}/api-docs
        ✅ API基础: http://localhost:${PORT}/api
        
        🔍 调试端点:
        - GET /api/products - 获取商品列表
        - POST /api/products - 添加商品
        - GET /api/status - 系统状态
        
        默认管理员: admin / admin123
        `);
    });
}

startServer().catch(console.error);
