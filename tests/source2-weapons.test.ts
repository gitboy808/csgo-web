import {describe,it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {attachWeaponToViewmodel} from '../src/world/source2-weapons';

it('parents the secondary weapon skeleton to the hand socket without doubling its coordinate rotation',()=>{
  const hands=new THREE.Group(),socket=new THREE.Bone(),gun=new THREE.Group(),weapon=new THREE.Bone();
  socket.name='wpn';socket.position.set(-.1,-.08,.5);socket.quaternion.set(-.5,-.5,-.5,.5);hands.add(socket);
  weapon.quaternion.set(-.5,-.5,-.5,.5);gun.add(weapon);attachWeaponToViewmodel(hands,gun);hands.updateMatrixWorld(true);
  expect(weapon.getWorldPosition(new THREE.Vector3()).distanceTo(socket.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
  expect(weapon.getWorldQuaternion(new THREE.Quaternion()).angleTo(socket.getWorldQuaternion(new THREE.Quaternion()))).toBeLessThan(1e-6);
});

const available=existsSync('public/assets/source2/weapons/manifest.json');
describe.skipIf(!available)('original weapon asset library',()=>{
  it.skipIf(!existsSync('local-assets/weapons/raw/weapons/models/usp_silencer/materials/usp_silencer_default_ao_tga_dcc4bd00.png'))('keeps original USP ambient occlusion in the glTF red channel',async()=>{
    await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
    const document=await io.read('public/assets/source2/weapons/usp/model.glb'),material=document.getRoot().listMaterials()[0];
    const actual=await sharp(material.getOcclusionTexture()!.getImage()!).extractChannel(0).raw().toBuffer();
    const expected=await sharp('local-assets/weapons/raw/weapons/models/usp_silencer/materials/usp_silencer_default_ao_tga_dcc4bd00.png').extractChannel(0).raw().toBuffer();
    expect(actual.equals(expected)).toBe(true);
  });
});
