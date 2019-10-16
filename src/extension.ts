// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as dgram from 'dgram';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.luabtsdebug.getGameAddr', config => {
		return vscode.window.showQuickPick(listGameAddr());
	}));
}

function listGameAddr(): Thenable<string[]> {
	let udp = dgram.createSocket('udp4');
	udp.bind(() => {
		udp.setBroadcast(true);
		for (let i = 0; i < 10; i++) {
			udp.send('{"typ":"info"}', 6600 + i, "255.255.255.255");
			udp.send('{"typ":"info"}', 6661 + i, "255.255.255.255");
		}
	});
	let list = new Array<string>();
	udp.on('message', (msg, rinfo) => {
		let data = JSON.parse(msg.toString());
		let typ = data.client ? 'client' : 'server';
		list[list.length] = `${rinfo.address}:${rinfo.port.toString()} - ${data.name}<${data.game}.${data.engineVersion}> ${typ} - ${data.sys}`;
	});
	return new Promise((resolve) => {
		setTimeout(() => {
			udp.close();
			resolve(list);
		}, 500);
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }
