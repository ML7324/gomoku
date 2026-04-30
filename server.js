const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
// 配置 Socket.io 允许所有跨域请求（前端部署在不同域名时必须加）
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 内存数据库：存储房间状态
const rooms = {}; 

io.on('connection', (socket) => {
    console.log('玩家已连接:', socket.id);

    // 1. 创建房间
    socket.on('createRoom', () => {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        rooms[code] = {
            players: { [socket.id]: 1 }, // 房主分配为 1 (黑子)
            board: new Array(225).fill(0),
            turn: 1,
            status: 'waiting'
        };
        socket.join(code);
        socket.emit('roomCreated', { code, role: 1 });
    });

    // 2. 加入房间
    socket.on('joinRoom', (code) => {
        const room = rooms[code];
        if (!room) {
            return socket.emit('errorMsg', '房间不存在');
        }
        if (Object.keys(room.players).length >= 2) {
            return socket.emit('errorMsg', '房间已满');
        }
        if (room.status !== 'waiting') {
            return socket.emit('errorMsg', '游戏已经开始');
        }

        // 分配为 2 (白子)
        room.players[socket.id] = 2;
        room.status = 'playing';
        socket.join(code);
        
        // 告诉加入者
        socket.emit('roomJoined', { code, role: 2, board: room.board, turn: room.turn });
        // 告诉整个房间游戏开始
        io.to(code).emit('gameStarted', { turn: room.turn });
    });

    // 3. 处理落子
    socket.on('makeMove', ({ code, idx }) => {
        const room = rooms[code];
        if (!room || room.status !== 'playing') return;

        const role = room.players[socket.id];
        // 验证：是否是该玩家的回合，并且该位置为空
        if (room.turn !== role || room.board[idx] !== 0) return;

        // 更新棋盘
        room.board[idx] = role;
        room.turn = role === 1 ? 2 : 1; // 切换回合

        // 广播给房间里的所有人最新状态
        io.to(code).emit('boardUpdated', { 
            board: room.board, 
            turn: room.turn, 
            lastMove: idx 
        });
    });

    // 4. 玩家断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
        for (const code in rooms) {
            if (rooms[code].players[socket.id]) {
                io.to(code).emit('errorMsg', '对手已退出游戏');
                io.to(code).emit('opponentLeft');
                delete rooms[code]; // 解散房间
                break;
            }
        }
    });
});

// Render 会自动分配端口给 process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`五子棋服务器运行在端口: ${PORT}`);
});