const redis = require('redis');
const client = redis.createClient();

// 连接 Redis
client.on('error', (err) => console.log('Redis Client Error', err));
client.connect();

// 创建/更新 Hash
client.hSet('user:1000', {
  'name': 'Alice',
  'email': 'alice@example.com',
  'age': '30',
  'score': '95.5'
});

// 获取单个字段
const name = client.hGet('user:1000', 'name');
console.log(name); // 输出: 'Alice'

// 获取整个 Hash
const user = client.hGetAll('user:1000');
console.log(user);
/* 输出:
{
  name: 'Alice',
  email: 'alice@example.com',
  age: '30',
  score: '95.5'
}
*/

// 增加数字字段值
client.hIncrBy('user:1000', 'age', 1);
const newAge = client.hGet('user:1000', 'age');
console.log(newAge); // 输出: '31'

// 删除字段
client.hDel('user:1000', 'score');

// 检查字段是否存在
const hasEmail = client.hExists('user:1000', 'email');
console.log(hasEmail); // 输出: true