import {getChatGPTUser} from '../chatgpt-auth';
import {remoteHttp} from '../../lib/remote-mcp';
export const dynamic='force-dynamic';
async function handle(req:Request){
 // Identity is accepted only from the existing trusted Sites dispatcher.
 // A client-supplied Bearer token is not treated as an authenticated user.
 const user=await getChatGPTUser();
 return remoteHttp(req,user?.userId??null);
}
export {handle as POST,handle as GET,handle as DELETE};
