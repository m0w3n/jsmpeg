import cv2
import socket
import sys
import numpy as np
import time
import requests
import hashlib
import random
import json

# 创建UDP套接字
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def registerDevice(host, port, token, deviceId, cameraIds):
    try:
        url = f'http://{host}:{port}/registerDevice?token={token}&deviceId={deviceId}&cameraIds={cameraIds}'
        print(url)
        # 发送HTTP POST请求
        response = requests.get(url=url,timeout=2)
        if response.status_code != 200:
            print(f"服务器返回错误: {response.status_code}")
            return False

        result = json.loads(response.text)
        if result["success"] == True:
            print(f"服务器返回成功: {result["message"]}")
            return True
        else:
            print(f"服务器返回失败: {result["message"]}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {str(e)}")
        return False

def udpSend(data, host, port, deviceId, cameraIds):
    # 通过UDP发送数据
    cameraIdsLen = len(str(cameraIds))
    dataTmp = deviceId.encode() + b'0'*(2-cameraIdsLen) + str(cameraIds).encode() + data
    sock.sendto(dataTmp, (host, port))


def send_picture(host, port, picture_path, deviceId, cameraIds):
    # 读取图像文件
    with open(picture_path, "rb") as f:
        image_data = f.read()

    print(len(image_data))

    udpSend(image_data, host, port, deviceId, cameraIds)

def send_video(host, port, video_path, frame_rate, deviceId, cameraIds):
    # 打开视频文件
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Error: 无法打开视频文件", file=sys.stderr)
        return

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # 将帧编码为JPEG格式
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 90]
            _, buffer = cv2.imencode('.jpg', frame, encode_param)

            # 转换为字节数据
            data = buffer.tobytes()

            print(len(data))

            udpSend(data, host, port, deviceId, cameraIds)

            time.sleep(1/frame_rate)

            # 按q键退出（可选）
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    finally:
        cap.release()
        sock.close()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    # if len(sys.argv) != 5:
    #     print("使用方法: python udp_client.py <服务器IP:127.0.0.1> <端口:12345> <图像/视频路径:icons/logo_320x240.jpg> <frameRate>")
    #     sys.exit(1)
    # server_ip = sys.argv[1]
    # udp_port = int(sys.argv[2])
    # file_path = sys.argv[3]
    # frame = int(sys.argv[4])

    server_ip = "xxxx"
    web_port = 8080
    udp_port = 8083
    token = "yoursecret"
    file_path = "logo_320x240.jpg"
    file_path = "SampleVideo_1280x720_20mb_25f~2.mp4"
    frame = 5*2

    file_suffix = file_path.split(".")[-1]

    deviceId = hashlib.md5(b'm0w3n').hexdigest()
    cameraIds = random_number = random.randint(0, 99)
    cameraIds = 15
    # if not registerDevice(server_ip, web_port, token, deviceId, cameraIds): exit(0)

    if file_suffix in ("jpg"):
        send_picture(server_ip, udp_port, file_path, deviceId, cameraIds)
    elif file_suffix in ("mp4"):
        send_video(server_ip, udp_port, file_path, frame, deviceId, cameraIds)

    print("1")
