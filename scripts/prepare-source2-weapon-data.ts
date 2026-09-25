import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseKV3} from './source2-kv3';

const source=parseKV3(await readFile('local-assets/weapons/data/scripts/weapons.vdata','utf8'));
const events=parseKV3(await readFile('local-assets/weapons/data/soundevents/game_sounds_weapons.vsndevts','utf8'));
const names={ak47:'weapon_ak47',m4a1:'weapon_m4a1_silencer',awp:'weapon_awp',glock:'weapon_glock',usp:'weapon_usp_silencer',deagle:'weapon_deagle',knife:'weapon_knife_m9_bayonet'};
const weapons:Record<string,any>={};
for(const [id,name]of Object.entries(names)){
  const item=source[name]||source[id==='knife'?'weapon_knife':name];if(!item)throw new Error(`Missing native definition: ${name}`);
  const mode=id==='m4a1'||id==='usp'?1:0;
  const scalar=(key:string,fallback=0)=>{const value=item[key];return typeof value==='number'?value:Array.isArray(value)?value[mode]??value[0]:fallback;};
  const clip=Math.max(1,item.m_iMaxClip1),reserve=item.m_nPrimaryReserveAmmoMax*(item.m_bReserveAmmoAsClips?clip:1);
  const reloadMeta=JSON.parse(await readFile(`local-assets/weapons/export/${id}/reload.gltf.events.json`,'utf8').catch(()=>'{}'));
  const insert=reloadMeta.sounds?.find((s:any)=>s.name.toLowerCase().includes('addammo'))?.at;
  weapons[id]={sourceName:source[name]?name:'weapon_knife',damage:item.m_nDamage,armorPenetration:item.m_flArmorRatio/2,headshotMultiplier:item.m_flHeadshotMultiplier,price:item.m_nPrice,magazine:clip,reserve:Math.max(0,reserve),interval:scalar('m_flCycleTime',.15),reload:scalar('m_flDisallowAttackAfterReloadStartDuration',2.4),reloadInsert:insert===undefined?undefined:insert/reloadMeta.duration*scalar('m_flDisallowAttackAfterReloadStartDuration',2.4),automatic:item.m_bIsFullAuto,
    tuning:{burst:item.m_bHasBurstMode?{cycle:item.m_flCycleTimeWhenInBurstMode,interval:item.m_flTimeBetweenBurstShots}:undefined,maxSpeed:scalar('m_flMaxSpeed')*.0254,range:scalar('m_flRange')*.0254,rangeModifier:scalar('m_flRangeModifier',.98),deploy:scalar('m_flDeployDuration',1),spread:scalar('m_flSpread'),stand:scalar('m_flInaccuracyStand'),crouch:scalar('m_flInaccuracyCrouch'),move:scalar('m_flInaccuracyMove'),jump:scalar('m_flInaccuracyJump'),land:scalar('m_flInaccuracyLand'),fire:scalar('m_flInaccuracyFire'),recoveryStand:scalar('m_flRecoveryTimeStand'),recoveryCrouch:scalar('m_flRecoveryTimeCrouch'),recoveryStandFinal:scalar('m_flRecoveryTimeStandFinal'),recoveryCrouchFinal:scalar('m_flRecoveryTimeCrouchFinal'),recoveryStart:scalar('m_nRecoveryTransitionStartBullet'),recoveryEnd:scalar('m_nRecoveryTransitionEndBullet'),recoilSeed:scalar('m_nRecoilSeed'),recoilAngle:scalar('m_flRecoilAngle'),recoilAngleVariance:scalar('m_flRecoilAngleVariance'),recoilMagnitude:scalar('m_flRecoilMagnitude'),recoilMagnitudeVariance:scalar('m_flRecoilMagnitudeVariance'),scoped:{spread:item.m_flSpread?.[1]??scalar('m_flSpread'),stand:item.m_flInaccuracyStand?.[1]??scalar('m_flInaccuracyStand'),crouch:item.m_flInaccuracyCrouch?.[1]??scalar('m_flInaccuracyCrouch'),move:item.m_flInaccuracyMove?.[1]??scalar('m_flInaccuracyMove'),maxSpeed:(item.m_flMaxSpeed?.[1]??scalar('m_flMaxSpeed'))*.0254},zoomLevels:scalar('m_nZoomLevels'),zoomFov:[scalar('m_nZoomFOV1',90),scalar('m_nZoomFOV2',90)],unzoomAfterShot:item.m_bUnzoomsAfterShot,hideWhenZoomed:item.m_bHideViewModelWhenZoomed},
    shootEvent:id==='knife'?'Weapon_Knife.Swish.Light':(item.m_aShootSounds||{})[mode?'WEAPON_SOUND_SPECIAL1':'WEAPON_SOUND_SINGLE']||(item.m_aShootSounds||{}).WEAPON_SOUND_SINGLE,
    source:item};
}
await mkdir('public/assets/source2/weapons',{recursive:true});
await writeFile('public/assets/source2/weapons/data.json',JSON.stringify({source:{app:730,depot:2347770,manifest:'5009084625236407721',resource:'scripts/weapons.vdata_c'},weapons}));
await writeFile('local-assets/weapons/sound-events.json',JSON.stringify(events));
console.log(Object.fromEntries(Object.entries(weapons).map(([id,w])=>[id,{damage:w.damage,head:w.headshotMultiplier,interval:w.interval,reload:w.reload,speed:w.tuning.maxSpeed,sound:w.shootEvent}])));
