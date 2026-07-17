import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  // SENSOR_API_KEY has been removed: sensor routes now authenticate via
  // per-device bcrypt-hashed API keys stored on the SensorDevice entity.
  // See ApiKeyGuard and the POST /sensors/readings route.
}));
