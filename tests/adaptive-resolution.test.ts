import {expect,it} from 'vitest';
import {AdaptiveResolution} from '../src/game/adaptive-resolution';
it('uses sustained overload, bounds the scale, and restores quality slowly',()=>{
  const budget=new AdaptiveResolution();
  for(let ms=16;ms<3000;ms+=16.667)budget.sample(ms,16.667,3,60);
  expect(budget.scale).toBe(1);
  budget.sample(3010,300,30,60);expect(budget.scale).toBe(1);
  for(let ms=3020;ms<14000;ms+=25)budget.sample(ms,25,15,60);
  expect(budget.scale).toBe(.85);
  for(let ms=14000;ms<50000;ms+=16.667)budget.sample(ms,16.667,3,60);
  expect(budget.scale).toBe(1);
  budget.reset();expect(budget.scale).toBe(1);
});
