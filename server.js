const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 存储位置数据（在实际应用中应使用数据库）
let locations = [];

// 管理员密码
const ADMIN_PASSWORD = 'admin123';

// 验证管理员权限中间件
function authenticateAdmin(req, res, next) {
    const password = req.headers['admin-password'];
    
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: '未授权访问' });
    }
}

// 路由

// 根路径 - 提供前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取所有位置记录（需要管理员权限）
app.get('/api/locations', authenticateAdmin, (req, res) => {
    res.json(locations);
});

// 提交位置数据
app.post('/api/locations', (req, res) => {
    const { userId, latitude, longitude, accuracy, altitude, timestamp } = req.body;
    
    // 验证必要字段
    if (!userId || !latitude || !longitude) {
        return res.status(400).json({ error: '缺少必要字段' });
    }
    
    // 创建位置记录
    const location = {
        id: Date.now().toString(),
        userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        altitude: altitude ? parseFloat(altitude) : null,
        timestamp: timestamp || new Date().toISOString()
    };
    
    // 添加到存储
    locations.push(location);
    
    console.log(`位置记录已添加: ${userId} - ${latitude}, ${longitude}`);
    
    res.status(201).json({ message: '位置数据已记录', location });
});

// 清空所有位置记录（需要管理员权限）
app.delete('/api/locations', authenticateAdmin, (req, res) => {
    const count = locations.length;
    locations = [];
    console.log(`已清空所有位置记录，共 ${count} 条`);
    res.json({ message: `已清空 ${count} 条位置记录` });
});

// 处理未匹配的路由
app.get('*', (req, res) => {
    res.redirect('/');
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`位置追踪服务器运行在 http://localhost:${PORT}`);
    console.log(`管理员密码: ${ADMIN_PASSWORD}`);
});
