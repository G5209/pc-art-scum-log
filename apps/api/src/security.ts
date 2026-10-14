import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import type {Express} from 'express';

export function installSecurity(app:Express){
 app.disable('x-powered-by');
 // Trust only the configured reverse proxy hop/subnet; never blindly trust arbitrary X-Forwarded-*.
 if(process.env.TRUST_PROXY)app.set('trust proxy',process.env.TRUST_PROXY);
 app.use(helmet());
 const production=process.env.NODE_ENV==='production';
 const allowed=new Set((process.env.CORS_ORIGINS??process.env.WEB_ORIGIN??'').split(',').filter(Boolean));
 app.use(cors({credentials:true,origin(origin,done){done(null,!origin||allowed.has(origin)||!production&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));}}));
 if(production||process.env.RATE_LIMIT_ENABLED==='true')app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-7',legacyHeaders:false,skip:req=>['/health','/metrics'].includes(req.path)}));
}
