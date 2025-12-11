// server.js - 完整修复版（文件存储）
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data.json');

// ========== 数据操作函数 ==========

// 初始化数据（创建文件）
async function initData() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ 数据文件已存在');
    } catch {
        // 创建初始数据
        const initialData = {
            users: [
                {
                    id: 1,
                    username: 'admin',
                    password: 'admin123',  // 明文密码
                    isAdmin: true,
                    is_admin: true
                }
            ],
            products: [],
            orders: [],
            settings: {
                storeName: 'CPMCY商城',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                contactInfo: 'FB账号GH Tree',
                welcomeMessage: '欢迎选购！点击购买扫码完成付款'
            }
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据文件');
    }
}

// 读取所有数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取数据失败:', error.message);
        // 返回空数据
        return {
            users: [],
            products: [],
            orders: [],
            settings: {}
        };
    }
}

// 保存所有数据
async function saveData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 数据已保存');
        return true;
    } catch (error) {
        console.error('保存数据失败:', error);
        return false;
    }
}

// ========== 商品功能 ==========
async function getProducts() {
    const data = await readData();
    return data.products || [];
}

async function addProduct(product) {
    const data = await readData();
    
    const newProduct = {
        id: Date.now(),
        name: product.name || '',
        price: parseFloat(product.price) || 0,
        description: product.description || '',
        image: product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品',
        createdAt: new Date().toISOString()
    };
    
    data.products = data.products || [];
    data.products.push(newProduct);
    
    await saveData(data);
    return newProduct;
}

async function deleteProduct(id) {
    const data = await readData();
    data.products = (data.products || []).filter(p => p.id != id);
    await saveData(data);
    return true;
}

// ========== 订单功能 ==========
async function getOrders() {
    const data = await readData();
    return data.orders || [];
}

async function addOrder(order) {
    const data = await readData();
    
    const newOrder = {
        id: Date.now(),
        orderNumber: order.orderNumber || ('DD' + Date.now().toString().slice(-8)),
        userId: order.userId || '',
        productId: order.productId || 0,
        productName: order.productName || '',
        productPrice: order.productPrice || 0,
        totalAmount: order.totalAmount || 0,
        paymentMethod: order.paymentMethod || 'tng',
        status: order.status || 'pending',
        createdAt: new Date().toISOString()
    };
    
    data.orders = data.orders || [];
    data.orders.push(newOrder);
    
    await saveData(data);
    return newOrder;
}

async function updateOrderStatus(orderId, status) {
    const data = await readData();
    const order = (data.orders || []).find(o => o.id == orderId);
    
    if (order) {
        order.status = status;
        await saveData(data);
        return true;
    }
    return false;
}

// ========== 用户功能 ==========
async function authenticateUser(username, password) {
    const data = await readData();
    const user = (data.users || []).find(u => u.username === username);
    
    // 直接比较明文密码
    if (user && user.password === password) {
        return {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin || user.is_admin || false,
            is_admin: user.isAdmin || user.is_admin || false
        };
    }
    return null;
}

async function registerUser(username, password) {
    const data = await readData();
    data.users = data.users || [];
    
    // 检查用户是否存在
    const userExists = data.users.some(u => u.username === username);
    if (userExists) return null;
    
    const newUser = {
        id: Date.now(),
        username: username,
        password: password,  // 明文存储
        isAdmin: false,
        is_admin: false
    };
    
    data.users.push(newUser);
    await saveData(data);
    return newUser;
}

// ========== 设置功能 ==========
async function getSettings() {
    const data = await readData();
    return data.settings || {};
}

async function updateSettings(newSettings) {
    const data = await readData();
    data.settings = {
        ...(data.settings || {}),
        ...newSettings
    };
    
    await saveData(data);
    return data.settings;
}

// ========== 数据统计 ==========
async function getStats() {
    const data = await readData();
    const products = data.products || [];
    const orders = data.orders || [];
    
    const today = new Date().toDateString();
    const todayOrders = orders.filter(order => 
        new Date(order.createdAt).toDateString() === today
    );
    
    return {
        totalProducts: products.length,
        totalOrders: orders.length,
        todayOrders: todayOrders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        paidOrders: orders.filter(o => o.status === 'paid').length,
        completedOrders: orders.filter(o => o.status === 'completed').length
    };
}

// ========== API路由 ==========

// 1. 商品API
app.get('/api/products', async (req, res) => {
    try {
        const products = await getProducts();
        res.json({ success: true, data: products });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = req.body;
        const saved = await addProduct(product);
        res.json({ success: true, data: saved });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await deleteProduct(req.params.id);
        res.json({ success: true });
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
        console.log(`🔐 登录尝试: ${username}`);
        
        const user = await authenticateUser(username, password);
        
        if (user) {
            console.log('✅ 登录成功');
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
            console.log('❌ 登录失败');
            res.json({ 
                success: false, 
                error: '用户名或密码错误',
                hint: '默认管理员: admin / admin123'
            });
        }
    } catch (error) {
        console.error('登录错误:', error);
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
                storeName: settings.storeName || 'CPMCY商城',
                kuaishouLink: settings.kuaishouLink || 'https://v.kuaishou.com/JGv00n48',
                contactInfo: settings.contactInfo || 'FB账号GH Tree',
                welcomeMessage: settings.welcomeMessage || '欢迎选购！点击购买扫码完成付款'
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
        const stats = await getStats();
        res.json({ success: true, data: stats });
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
                storageType: 'file',
                productsCount: products.length,
                port: PORT
            }
        });
    } catch (error) {
        res.json({ success: true, data: { status: 'running' } });
    }
});

// 7. 备份数据API
app.get('/api/backup', async (req, res) => {
    try {
        const data = await readData();
        res.setHeader('Content-Disposition', 'attachment; filename="cpmcy-backup.json"');
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 2));
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// 8. 重置数据API（用于测试）
app.post('/api/reset', async (req, res) => {
    try {
        await initData();
        res.json({ success: true, message: '数据已重置' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.send(`
                <html>
                    <body style="font-family: Arial; padding: 50px; text-align: center;">
                        <h1>🚀 CPMCY商城</h1>
                        <p>后端运行中</p>
                        <p>端口: ${PORT}</p>
                        <p>默认管理员: <strong>admin / admin123</strong></p>
                        <p><a href="/api/status">查看API状态</a></p>
                        <p><a href="/api/products">查看商品</a></p>
                    </body>
                </html>
            `);
        }
    });
});

// ========== 启动服务器 ==========
async function startServer() {
    // 初始化数据
    await initData();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城已启动！
        📍 端口: ${PORT}
        📍 地址: http://localhost:${PORT}/
        📍 存储: 本地文件 (data.json)
        
        ✅ 功能列表:
        - 商品管理（添加、删除、查看）
        - 订单管理（创建、状态更新、查看）
        - 用户系统（登录、注册）
        - 系统设置
        - 数据统计
        
        🔗 登录信息:
        - 用户名: admin
        - 密码: admin123
        
        📊 测试链接:
        - http://localhost:${PORT}/api/status
        - http://localhost:${PORT}/api/products
        `);
    });
}

startServer().catch(console.error);
