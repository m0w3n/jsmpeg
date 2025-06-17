import socket

hostname = socket.gethostname()

def get_server_ip():
    ip_list = []

    # 获取IP地址信息

    addr_infos = socket.getaddrinfo(hostname, None)

    for addr in addr_infos:
        if "192.168.1." in addr[4][0]:
            ip_list.append(addr[4][0])

    # print(ip_list)
    if len(ip_list) > 0 :
        return ",".join(ip_list)

    return "127.0.0.1"  # 默认回环地址

def udp_server():
    # 配置参数
    host = '0.0.0.0'  # 监听所有网络接口
    port = 12345       # 监听端口

    # 创建UDP套接字
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        # 绑定端口
        sock.bind((host, port))
        print(f"🟢 UDP服务器已启动，监听 {host}:{port}")

        try:
            while True:
                # 接收数据和客户端地址
                data, addr = sock.recvfrom(65507)
                client_ip, client_port = addr

                print(f"📥 收到来自 {client_ip}:{client_port} 的消息: {data.decode()}")

                # 检查是否为触发消息
                if data.strip() == b'DISCOVER_DEVICES':
                    # 发送响应
                    response_msg = f'DEVICE_DISCOVERY|OcularHub|{get_server_ip()}'.encode() # 响应消息
                    sock.sendto(response_msg, addr)
                    print(f"📤 已向 {client_ip}:{client_port} 发送响应")
                else:
                    print(f"⚠️  未识别的消息，已忽略")

        except KeyboardInterrupt:
            print("\n🔴 服务器已关闭")

if __name__ == '__main__':
    udp_server()


