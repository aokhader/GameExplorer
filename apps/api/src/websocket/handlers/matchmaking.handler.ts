import { Server as SocketIOServer, Socket } from 'socket.io';

export function registerMatchmakingHandlers(io: SocketIOServer, socket: Socket) {
  socket.on('join_matchmaking', (data) => {
    // TODO: Implement matchmaking logic
    console.log('Join matchmaking:', data);
    
    socket.emit('matchmaking_joined', {
      queuePosition: 1,
      estimatedWait: 30,
    });
  });

  socket.on('leave_matchmaking', () => {
    // TODO: Implement leave matchmaking logic
    console.log('Leave matchmaking');
  });
}