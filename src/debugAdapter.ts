import * as dgram from 'dgram';
import * as Net from 'net';
import { DebugProtocol } from 'vscode-debugprotocol';
import { spawn } from 'child_process';
import * as fs from 'fs';

let socket: Net.Socket | null = null;
let recvStr = "";

process.stdin.on('data', recvStdin);

function recvStdin(data: Buffer) {
    recvStr += data.toString();
    while (true) {
        let index = recvStr.indexOf('\r\n\r\n');
        if (index < 0) {
            break;
        }
        let line = recvStr.substr(0, index);
        let ary = line.split(':');
        if (ary.length !== 2 || ary[0] !== 'Content-Length') {
            exit();
        }
        let len = parseInt(ary[1]);
        if (recvStr.length < index + 4 + len) {
            break;
        }
        let packet = JSON.parse(recvStr.substr(index + 4, len));
        processPacket(packet);
        recvStr = recvStr.substr(index + 4 + len);
    }
}

function processPacket(req: DebugProtocol.Request) {
    if (req.command === 'initialize') {
        let res = <DebugProtocol.InitializeResponse>{};
        res.type = 'response';
        res.command = req.command;
        res.success = true;
        res.request_seq = req.seq;
        res.body = {};
        res.body.supportsConfigurationDoneRequest = true;
        res.body.supportsEvaluateForHovers = true;
        res.body.supportsSetVariable = true;
        res.body.supportsExceptionInfoRequest = true;
        res.body.exceptionBreakpointFilters = [
            {
                'filter': 'perror',
                'label': 'SCRIPT_EXCEPTION output',
                'default': false
            }, {
                'filter': 'xpcall',
                'label': 'exception in xpcall',
                'default': true
            }, {
                'filter': 'endless',
                'label': 'break when endless',
                'default': false
            },
        ];
        process.stdout.write(msg2txt(res));
    } else if (req.command === 'attach') {
        let addr = req.arguments.targetAddr;
        let index = addr.indexOf(' ');
        if (index >= 0) {
            addr = addr.substr(0, index);
        }
        index = addr.indexOf(':');
        let host = addr.substr(0, index);
        let port = parseInt(addr.substr(index + 1));
        let udp = dgram.createSocket('udp4');
        udp.send('{"typ":"debug"}', port, host);
        udp.on('message', msg => {
            let dbgData = JSON.parse(msg.toString());
            udp.close();
            socket = Net.connect(dbgData.port, host);
            start(socket, req);
        });
    } else if (req.command === 'launch') {
        let server = Net.createServer(socket => {
            server.close();
            start(socket, req);
        });
        let port = (server.listen().address() as Net.AddressInfo).port;
        spawn(req.arguments.gameExe, [req.arguments.gameArgs], {
            cwd : req.arguments.resDir,
            env : { DebugConnect : port.toString() },
            shell : true,
            detached : true
        });
    } else {
        exit();
    }
}

function start(socket: Net.Socket, req: DebugProtocol.Request) {
    process.stdin.off('data', recvStdin);

    var args = req.arguments;
    if(!args.gameDir && args.resDir) {
        let resDir = (args.resDir as string).replace(/\//g, '\\');
        if (resDir.endsWith('\\')) {
            resDir = resDir.substring(0, resDir.length-1);
        }
        let path = resDir + '\\gameconfig.json';
        try {
            let text = fs.readFileSync(path, 'utf-8');
            var cfg = JSON.parse(text);

            let gameDir = (cfg.dataDir as string || 'game').replace(/\//g, '\\');
            let gameType = (cfg.gtype as string || 'sample');
            if (gameDir.startsWith('.\\')) {
                gameDir = gameDir.substring(2);
            }
            if (gameDir.endsWith('\\')) {
                gameDir = gameDir.substring(0, gameDir.length-1);
            }
            if (gameDir === 'game' && !fs.existsSync(resDir + '\\game\\' + gameType)) {
                gameDir = 'game_res';
            }
            if (gameDir.length < 2 || (gameDir[1] !== ':' && gameDir[0] !== '\\')) {
                gameDir = resDir + '\\' + gameDir;
            }
            if (fs.existsSync(gameDir + '\\' + gameType)) {
                args.gameDir = gameDir + "\\{gameName}";
            }
        } catch (err) {
        }
    }

    socket.write(msg2txt(req));
    process.stdin.on('data', (data: Buffer) => {
        if (socket) {
            socket.write(data);
        }
    });
    process.stdin.on('close', exit);
    socket.on('data', (data: Buffer) => process.stdout.write(data));
    socket.on('close', exit);
    socket.on('error', exit);
}

function exit() {
    if (socket) {
        socket.destroy();
        socket = null;
    }
    process.exit();
}

function msg2txt(msg: DebugProtocol.ProtocolMessage) {
    let json = JSON.stringify(msg);
    return 'Content-Length: ' + json.length.toString() + '\r\n\r\n' + json;
}

function errMsg(msg: string, req: DebugProtocol.Request){
    let res = <DebugProtocol.Response>{};
    res.type = 'response';
    res.command = req.command;
    res.request_seq = req.seq;
    res.body = {};
    res.success = false;
    res.message = msg;
    process.stdout.write(msg2txt(res));
}
