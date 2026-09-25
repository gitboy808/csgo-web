/** Bounded, slow adaptation. Single stalls never lower image quality. */
export class AdaptiveResolution {
  scale=1;
  private started=0;private intervals:number[]=[];private work=0;private lastChange=0;
  reset(){this.scale=1;this.started=0;this.intervals=[];this.work=0;this.lastChange=0;}
  sample(now:number,intervalMs:number,workMs:number,frameLimit:number){
    if(!this.started)this.started=now;
    if(intervalMs>0&&intervalMs<80){this.intervals.push(intervalMs);this.work+=workMs;}
    if(now-this.started<2000||this.intervals.length<25)return false;
    const count=this.intervals.length,average=this.intervals.reduce((sum,n)=>sum+n,0)/count,cost=this.work/count,budget=1000/frameLimit,previous=this.scale;
    if(average>budget*1.18&&now-this.lastChange>=2000)this.scale=Math.max(.85,Math.round((this.scale-.05)*100)/100);
    else if(average<budget*1.06&&cost<budget*.5&&now-this.lastChange>=10000)this.scale=Math.min(1,Math.round((this.scale+.05)*100)/100);
    this.started=now;this.intervals=[];this.work=0;
    if(this.scale!==previous){this.lastChange=now;return true;}return false;
  }
}
