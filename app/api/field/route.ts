import { NextResponse } from 'next/server';
import { boot } from '@/lib/boot';
import { currentContext } from '@/lib/auth';
import { saveFieldEntry } from '@/lib/operations';
import { ensureTrialClock, shopAccess } from '@/lib/trial';
import { DEMO_EMAIL } from '@/lib/seed';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if (!origin || origin!==new URL(request.url).origin) return NextResponse.json({error:'This request must come from Sere.'},{status:403});
  await boot();
  const ctx=await currentContext(request);
  if (!ctx) return NextResponse.json({error:'Sign in to sync your field updates.'},{status:401});
  const isDemo=ctx.user.email===DEMO_EMAIL;
  const org=await ensureTrialClock(ctx.org,isDemo);
  if (shopAccess(org,isDemo).frozen) return NextResponse.json({error:'Your shop is read-only. Field updates remain on this device.'},{status:403});
  if (Number(request.headers.get('content-length')||0)>550000) return NextResponse.json({error:'This update is too large.'},{status:413});
  try {
    const raw=await request.text();
    if (raw.length>550000) return NextResponse.json({error:'This update is too large.'},{status:413});
    const body=JSON.parse(raw);
    if (body.organizationId!==org.id || body.userId!==ctx.user.id) return NextResponse.json({error:'Sign in to the original account to sync this update.'},{status:403});
    const result=await saveFieldEntry(org.id,ctx.user.id,{jobId:Number(body.jobId),kind:String(body.kind),body:String(body.body||''),minutes:Number(body.minutes||0),capturedAt:String(body.capturedAt),mutationId:String(body.mutationId),checklistId:body.checklistId,done:body.done,version:body.version});
    return NextResponse.json(result);
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Could not save the field update.'},{status:409});
  }
}
