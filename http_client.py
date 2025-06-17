import cv2
import requests
import sys
import time

def send_frame_to_server(image_bytes, server_url):
    """将帧编码为JPEG并发送到服务器"""
    try:
        # 发送HTTP POST请求
        response = requests.post(
            url=server_url,
            files={'image': ('frame.jpg', image_bytes, 'image/jpeg')},
            timeout=10  # 设置超时时间
        )

        if response.status_code == 200:
            print(f"帧发送成功，响应: {response.text}")
            return True
        else:
            print(f"服务器返回错误: {response.status_code}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {str(e)}")
        return False


def send_video(server_url, video_path, frame_rate):
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

            # 通过http发送数据
            send_frame_to_server(data, server_url)

            time.sleep(1/frame_rate)

            # 按q键退出（可选）
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    finally:
        cap.release()
        sock.close()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    # if len(sys.argv) != 4:
    #     print("使用方法: python http_client.py <url:http://127.0.0.1:3000/upload> <图像/视频路径:icons/logo_320x240.jpg> <frameRate>")
    #     sys.exit(1)
    # server_ip = sys.argv[1]
    # url = sys.argv[2]
    # frame = int(sys.argv[3])

    url="http://xxxxx:8080/upload"
    file_path = "SampleVideo_1280x720_20mb_25f~2.mp4"
    frame = 50

    file_suffix = file_path.split(".")[-1]

    send_video(url, file_path, frame)

    print("1")
