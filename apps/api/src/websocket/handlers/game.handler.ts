import { Server as SocketIOServer, Socket } from 'socket.io';

export function registerGameHandlers(io: SocketIOServer, socket: Socket) {
  socket.on('make_move', (data) => {
    // TODO: Implement game move logic
    console.log('Move received:', data);
  });

  socket.on('resign', (data) => {
    // TODO: Implement resignation logic
    console.log('Resign received:', data);
  });

  socket.on('offer_draw', (data) => {
    // TODO: Implement draw offer logic
    console.log('Draw offer received:', data);
  });
}