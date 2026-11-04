import { QueueClient,send as enqueue } from '@vercel/queue';
import { runtime } from '../runtime.js';
import { processCatalogStep } from '../catalog-step.js';
const queue=new QueueClient();
export default queue.handleNodeCallback(async message=>{
 await processCatalogStep(message,{...runtime(),enqueue,key:process.env.GIFT_SATELLITE_API_KEY});
},{visibilityTimeoutSeconds:330});
