import {migrations} from '../apps/api/src/migrations';
export default migrations.find(m=>m.id==='0005_tenant_boundary')!;
