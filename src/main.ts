import './style.css'
import { startApp } from './app'

const canvas = document.getElementById('app')
if (canvas instanceof HTMLCanvasElement) startApp(canvas)
