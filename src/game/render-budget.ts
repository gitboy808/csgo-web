export type RenderMode='play'|'menu'|'inspect'|'paused';

/** Limit scene submissions, independent of the fixed-step simulation clock. */
export class RenderBudget {
  private deadline=-Infinity;
  private last=-Infinity;
  private mode:RenderMode|null=null;
  private dirty=true;
  invalidate(){this.dirty=true;}
  take(now:number,mode:RenderMode,limit:number):number|null{
    if(mode!==this.mode){this.mode=mode;this.dirty=true;this.deadline=now;}
    const fps=mode==='menu'?30:mode==='inspect'?60:limit;
    // RAF timestamps jitter slightly even on a 120 Hz display. A 1 ms allowance
    // avoids turning a 16.7 ms frame into 25 ms; the anchored deadline still caps
    // the long-term submission rate and cannot accumulate early-frame drift.
    if(!this.dirty&&(mode==='paused'||now+1<this.deadline))return null;
    const dt=Number.isFinite(this.last)?Math.min(.1,Math.max(0,(now-this.last)/1000)):0;
    const interval=1000/fps;
    this.deadline=this.dirty||now-this.deadline>interval?now+interval:this.deadline+interval;
    this.last=now;this.dirty=false;return dt;
  }
}
