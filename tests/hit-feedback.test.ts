import{describe,it,expect}from'vitest';
import{Ray,Vector3}from'three';
import{armorProtects,hitSoundEvent,soundDistanceGain}from'../src/game/hit-feedback';
import{resolveDamage}from'../src/game/weapons';
import{rayCapsule}from'../src/world/hitboxes';
describe('anatomical hit feedback',()=>{
  it('chooses helmet protection before the shot consumes the remaining armor',()=>{
    expect(armorProtects('head',1,true)).toBe(true);expect(armorProtects('head',100,false)).toBe(false);expect(armorProtects('head',0,true)).toBe(false);
    expect(armorProtects('leftArm',100,true)).toBe(true);expect(armorProtects('rightLeg',100,true)).toBe(false);
    expect(hitSoundEvent({group:'head',armored:true,lethal:true,perspective:'AttackerFeedback'})).toBe('Player.DeathHeadShotArmor.AttackerFeedback');
    expect(hitSoundEvent({group:'leftLeg',armored:false,lethal:false,perspective:'Victim'})).toBe('Player.DamageBody.Victim');
  });
  it('uses stomach and leg damage without letting a vest protect legs',()=>{
    expect(resolveDamage(40,'stomach',0,false,.5).damage).toBe(50);
    expect(resolveDamage(40,'chest',100,false,.5)).toEqual({damage:20,armorUsed:10});
    expect(resolveDamage(40,'leftLeg',100,true,.5)).toEqual({damage:30,armorUsed:0});
    expect(resolveDamage(40,'head',100,true,.5)).toEqual({damage:80,armorUsed:40});
  });
  it('maps metre distances to Source inch curves and clamps distant endpoints',()=>{
    const curve=[[0,1,0,-.01],[100,0,-.01,0]];
    expect(soundDistanceGain(curve,0)).toBe(1);expect(soundDistanceGain(curve,1.27)).toBeCloseTo(.5);expect(soundDistanceGain(curve,100)).toBe(0);
  });
});
describe('native hit capsules',()=>{
  const a=new Vector3(0,0,0),b=new Vector3(0,2,0);
  it('returns the first surface instead of the ray point nearest the bone',()=>{
    expect(rayCapsule(new Ray(new Vector3(0,1,5),new Vector3(0,0,-1)),a,b,.25)).toBeCloseTo(4.75);
    expect(rayCapsule(new Ray(new Vector3(.3,1,5),new Vector3(0,0,-1)),a,b,.25)).toBe(Infinity);
  });
  it('handles rays parallel to a limb, inside capsules, and degenerate spheres',()=>{
    expect(rayCapsule(new Ray(new Vector3(0,5,0),new Vector3(0,-1,0)),a,b,.25)).toBeCloseTo(2.75);
    expect(rayCapsule(new Ray(new Vector3(0,1,0),new Vector3(0,0,-1)),a,b,.25)).toBe(0);
    expect(rayCapsule(new Ray(new Vector3(0,0,2),new Vector3(0,0,-1)),a,a,.25)).toBeCloseTo(1.75);
    expect(rayCapsule(new Ray(new Vector3(0,1,5),new Vector3(0,0,1)),a,b,.25)).toBe(Infinity);
  });
});
