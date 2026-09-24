import './style.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import { Game } from './game/game';

try {
  const game=new Game();
  game.init().catch(error=>{console.error(error);game.ui.error(error);});
}catch(error){
  console.error(error);
  document.querySelector('#app')!.innerHTML='<div class="loading-screen"><h1>此浏览器暂时无法启动 3D 场景</h1><p>请使用支持 WebGL 2 的桌面 Chrome 或 Edge，并启用硬件加速。</p><button class="text-button" onclick="location.reload()">重新尝试 ↻</button></div>';
}
