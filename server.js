const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 存储位置数据
let locations = [];

// 管理员密码
const ADMIN_PASSWORD = 'admin123';

// 路由

// 根路径 - 提供前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取所有位置记录（需要管理员权限）
app.get('/api/locations', (req, res) => {
    console.log('收到获取位置记录请求');
    console.log('请求头:', req.headers);
    
    // 检查管理员权限
    const password = req.headers['admin-password'];
    if (password !== ADMIN_PASSWORD) {
        console.log('管理员密码验证失败');
        return res.status(401).json({ error: '未授权访问' });
    }
    
    console.log('管理员密码验证成功');
    console.log('返回位置记录数量:', locations.length);
    res.json(locations);
});

// 提交位置数据
app.post('/api/locations', (req, res) => {
    console.log('收到位置数据:', req.body);
    
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
    console.log('当前总记录数:', locations.length);
    
    res.status(201).json({ message: '位置数据已记录', location });
});

// 清空所有位置记录（需要管理员权限）
app.delete('/api/locations', (req, res) => {
    console.log('收到清空位置记录请求');
    
    // 检查管理员权限
    const password = req.headers['admin-password'];
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: '未授权访问' });
    }
    
    const count = locations.length;
    locations = [];
    console.log(`已清空所有位置记录，共 ${count} 条`);
    res.json({ message: `已清空 ${count} 条位置记录` });
});

// 获取服务器状态（用于调试）
app.get('/api/status', (req, res) => {
    res.json({
        totalLocations: locations.length,
        serverTime: new Date().toISOString(),
        locations: locations.slice(-5) // 返回最近5条记录
    });
});

// 处理未匹配的路由
app.get('*', (req, res) => {
    res.redirect('/');
});

// 启动服务器
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`位置追踪服务器运行在 http://localhost:${PORT}`);
    console.log(`管理员密码: ${ADMIN_PASSWORD}`);
    console.log('='.repeat(50));
});
