import {Group,Scene,type Camera,type WebGLRenderer} from 'three';
import {source2SkyboxMatrix} from './source2-transform';
import type {Source2MapData} from './source2-types';

/** Source 2 draws its miniature city behind the playable world, regardless of depth. */
export class Source2Layers {
  readonly background=new Scene();
  constructor(readonly foreground:Scene){}
  addSkybox(content:Group,definition:NonNullable<Source2MapData['skybox']>){
    const root=new Group();root.matrix.copy(source2SkyboxMatrix(definition));root.matrixAutoUpdate=false;root.add(content);this.background.add(root);return root;
  }
  render(renderer:WebGLRenderer,camera:Camera){
    const updateShadows=renderer.shadowMap.needsUpdate;renderer.shadowMap.needsUpdate=false;
    renderer.render(this.background,camera);
    renderer.clearDepth();renderer.shadowMap.needsUpdate=updateShadows;
    renderer.render(this.foreground,camera);
  }
}
