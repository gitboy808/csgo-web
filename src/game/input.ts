export class Input {
  keys=new Set<string>();pressed=new Set<string>();firing=false;firePressed=false;rightPressed=false;dx=0;dy=0;wheel=0;
  onAction:(code:string)=>void=()=>{};
  constructor(readonly canvas:HTMLCanvasElement) {
    window.addEventListener('keydown',e=>{
      if(['Space','Tab','KeyW','KeyA','KeyS','KeyD','ControlLeft','ShiftLeft'].includes(e.code)&&document.pointerLockElement===canvas)e.preventDefault();
      if(!this.keys.has(e.code)){this.pressed.add(e.code);this.onAction(e.code);}this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){this.dx+=e.movementX;this.dy+=e.movementY;}});
    window.addEventListener('mousedown',e=>{if(document.pointerLockElement!==canvas)return;if(e.button===0){this.firing=true;this.firePressed=true;}if(e.button===2)this.rightPressed=true;});
    window.addEventListener('mouseup',e=>{if(e.button===0)this.firing=false;});
    window.addEventListener('wheel',e=>{if(document.pointerLockElement===canvas)this.wheel+=Math.sign(e.deltaY);},{passive:true});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('blur',()=>this.reset());
  }
  reset(){this.keys.clear();this.pressed.clear();this.firing=false;this.firePressed=false;this.dx=this.dy=0;this.wheel=0;}
  consume(){this.pressed.clear();this.firePressed=false;this.rightPressed=false;this.dx=this.dy=0;this.wheel=0;}
  down(...codes:string[]){return codes.some(c=>this.keys.has(c));}
}
