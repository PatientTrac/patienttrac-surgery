import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Attribution: Base anatomical references by Servier Medical Art (smart.servier.com) CC BY 4.0 ──

const SKIN = '#F4C5A3'
const SKIN2 = '#E8A87C'
const SKIN_STROKE = '#8B5A3C'
const GUIDE = 'rgba(0,180,200,0.6)'
const LANDMARK = '#4A90D9'
const REF_LINE = 'rgba(0,212,255,0.25)'

// ── SVG Templates ──────────────────────────────────────────────────────────────────────────────────

const svgAbdomenAnterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
  <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- torso outline: shoulders to mid-thigh -->
<path d="M60,10 C44,14 30,24 24,40 C18,56 18,78 20,98 L22,120 C20,136 18,158 18,182 C18,210 22,238 28,262 C34,284 42,304 52,320 C62,336 74,346 88,352 L106,360 L150,364 L194,360 L212,352 C226,346 238,336 248,320 C258,304 266,284 272,262 C278,238 282,210 282,182 C282,158 280,136 278,120 L280,98 C282,78 282,56 276,40 C270,24 256,14 240,10 L210,6 L150,4 L90,6 Z" fill="url(#sk)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- costal margins -->
<path d="M24,98 C34,92 54,84 80,80 C104,76 128,76 150,76 C172,76 196,76 220,80 C246,84 266,92 276,98" stroke="${SKIN_STROKE}" stroke-width="1.8" fill="none"/>
<path d="M24,98 C32,110 46,118 62,122 C76,126 96,128 110,128" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none"/>
<path d="M276,98 C268,110 254,118 238,122 C224,126 204,128 190,128" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none"/>
<!-- 9-region grid lines -->
<!-- horizontal at costal margin ~y=128 -->
<line x1="30" y1="128" x2="270" y2="128" stroke="${REF_LINE}" stroke-width="1.2"/>
<!-- horizontal at umbilicus ~y=220 -->
<line x1="30" y1="220" x2="270" y2="220" stroke="${REF_LINE}" stroke-width="1.2"/>
<!-- horizontal at ASIS ~y=308 -->
<line x1="30" y1="308" x2="270" y2="308" stroke="${REF_LINE}" stroke-width="1.2"/>
<!-- vertical left ~x=100 -->
<line x1="100" y1="100" x2="100" y2="360" stroke="${REF_LINE}" stroke-width="1.2"/>
<!-- vertical right ~x=200 -->
<line x1="200" y1="100" x2="200" y2="360" stroke="${REF_LINE}" stroke-width="1.2"/>
<!-- midline (linea alba) -->
<line x1="150" y1="76" x2="150" y2="364" stroke="rgba(0,212,255,0.4)" stroke-width="1" stroke-dasharray="6,4"/>
<!-- region labels -->
<text x="150" y="118" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">Epigastric</text>
<text x="65" y="118" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">RUQ</text>
<text x="235" y="118" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">LUQ</text>
<text x="150" y="180" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">Umbilical</text>
<text x="62" y="180" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">R Lumbar</text>
<text x="237" y="180" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">L Lumbar</text>
<text x="150" y="270" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">Hypogastric</text>
<text x="62" y="270" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">RIF</text>
<text x="237" y="270" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">LIF</text>
<!-- umbilicus landmark -->
<ellipse cx="150" cy="220" rx="9" ry="10" fill="none" stroke="${SKIN_STROKE}" stroke-width="2"/>
<circle cx="150" cy="220" r="4" fill="${SKIN2}" opacity="0.7"/>
<!-- ASIS landmarks -->
<circle cx="48" cy="308" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="16" y="312" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<circle cx="252" cy="308" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="262" y="312" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<!-- pubic symphysis -->
<ellipse cx="150" cy="358" rx="18" ry="8" fill="rgba(74,144,217,0.2)" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="150" y="378" text-anchor="middle" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Pubic Symphysis</text>
<!-- umbilicus label -->
<text x="164" y="218" font-size="8" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">UMB</text>
</svg>`

const svgAbdomenPosterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
  <linearGradient id="sk2" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- posterior torso outline -->
<path d="M60,10 C44,14 30,24 24,40 C18,56 18,78 20,98 L22,120 C20,136 18,158 18,182 C18,210 22,238 28,262 C34,284 42,304 52,320 C62,336 74,346 88,352 L106,360 L150,364 L194,360 L212,352 C226,346 238,336 248,320 C258,304 266,284 272,262 C278,238 282,210 282,182 C282,158 280,136 278,120 L280,98 C282,78 282,56 276,40 C270,24 256,14 240,10 L210,6 L150,4 L90,6 Z" fill="url(#sk2)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- spine midline dashed -->
<line x1="150" y1="10" x2="150" y2="370" stroke="rgba(0,212,255,0.5)" stroke-width="1.5" stroke-dasharray="8,5"/>
<text x="154" y="50" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Spine</text>
<!-- scapular outlines -->
<path d="M80,40 C68,50 64,68 68,84 C72,96 82,104 94,106 C106,108 116,102 120,92 C124,82 120,68 112,58 C104,48 90,38 80,40 Z" fill="none" stroke="${GUIDE}" stroke-width="1.2" opacity="0.7"/>
<path d="M220,40 C232,50 236,68 232,84 C228,96 218,104 206,106 C194,108 184,102 180,92 C176,82 180,68 188,58 C196,48 210,38 220,40 Z" fill="none" stroke="${GUIDE}" stroke-width="1.2" opacity="0.7"/>
<text x="78" y="75" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">R Scapula</text>
<text x="194" y="75" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">L Scapula</text>
<!-- iliac crests -->
<path d="M30,290 C50,278 90,272 130,274 C140,275 150,276 150,276" stroke="${LANDMARK}" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M270,290 C250,278 210,272 170,274 C160,275 150,276 150,276" stroke="${LANDMARK}" stroke-width="2" fill="none" stroke-linecap="round"/>
<text x="22" y="288" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Iliac Crest</text>
<!-- lumbar dimples -->
<circle cx="122" cy="298" r="5" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<circle cx="178" cy="298" r="5" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- sacrum outline -->
<path d="M118,330 C118,344 124,356 136,362 C142,364 158,364 164,362 C176,356 182,344 182,330 C170,326 130,326 118,330 Z" fill="none" stroke="${GUIDE}" stroke-width="1.2"/>
<text x="150" y="350" text-anchor="middle" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">Sacrum</text>
<!-- gluteal fold -->
<path d="M54,318 Q150,332 246,318" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" opacity="0.6"/>
<!-- paraspinal muscle outlines -->
<path d="M120,110 C116,140 114,170 116,200 C118,228 122,254 124,278" stroke="${GUIDE}" stroke-width="1" fill="none" stroke-dasharray="4,3" opacity="0.5"/>
<path d="M180,110 C184,140 186,170 184,200 C182,228 178,254 176,278" stroke="${GUIDE}" stroke-width="1" fill="none" stroke-dasharray="4,3" opacity="0.5"/>
</svg>`

const svgNeckAnterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 300">
<defs>
  <linearGradient id="sk3" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- neck outline chin to clavicles -->
<path d="M70,10 C58,16 46,26 40,42 C34,58 34,78 38,96 C42,112 50,126 60,138 C70,150 82,158 94,162 L130,168 L166,162 C178,158 190,150 200,138 C210,126 218,112 222,96 C226,78 226,58 220,42 C214,26 202,16 190,10 L160,6 L130,4 L100,6 Z" fill="url(#sk3)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- clavicles at bottom -->
<path d="M30,246 C44,238 74,234 104,236 C118,237 130,238 130,238" stroke="${SKIN_STROKE}" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M230,246 C216,238 186,234 156,236 C142,237 130,238 130,238" stroke="${SKIN_STROKE}" stroke-width="2" fill="none" stroke-linecap="round"/>
<!-- lower neck / supraclavicular area -->
<path d="M60,168 C50,182 42,200 38,220 C34,238 36,254 40,262 C52,272 80,280 106,282 L130,284 L154,282 C180,280 208,272 220,262 C224,254 226,238 222,220 C218,200 210,182 200,168" fill="url(#sk3)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- midline reference -->
<line x1="130" y1="4" x2="130" y2="284" stroke="rgba(0,212,255,0.35)" stroke-width="1" stroke-dasharray="6,4"/>
<!-- trachea -->
<rect x="118" y="80" width="24" height="110" rx="12" fill="none" stroke="${GUIDE}" stroke-width="1.5"/>
<line x1="118" y1="100" x2="154" y2="100" stroke="${GUIDE}" stroke-width="0.8" opacity="0.5"/>
<line x1="118" y1="115" x2="154" y2="115" stroke="${GUIDE}" stroke-width="0.8" opacity="0.5"/>
<line x1="118" y1="130" x2="154" y2="130" stroke="${GUIDE}" stroke-width="0.8" opacity="0.5"/>
<line x1="118" y1="145" x2="154" y2="145" stroke="${GUIDE}" stroke-width="0.8" opacity="0.5"/>
<text x="130" y="202" text-anchor="middle" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">Trachea</text>
<!-- thyroid gland butterfly shape -->
<path d="M88,104 C80,100 72,100 68,106 C64,112 66,122 72,128 C78,134 88,136 96,132 C104,128 108,120 106,112 C104,106 96,102 88,104 Z" fill="rgba(0,180,200,0.15)" stroke="${GUIDE}" stroke-width="1.5"/>
<path d="M172,104 C180,100 188,100 192,106 C196,112 194,122 188,128 C182,134 172,136 164,132 C156,128 152,120 154,112 C156,106 164,102 172,104 Z" fill="rgba(0,180,200,0.15)" stroke="${GUIDE}" stroke-width="1.5"/>
<!-- thyroid isthmus -->
<path d="M106,116 C112,116 118,116 130,116 C142,116 148,116 154,116" stroke="${GUIDE}" stroke-width="3" fill="none" stroke-linecap="round"/>
<text x="130" y="145" text-anchor="middle" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">Thyroid</text>
<!-- SCM borders -->
<path d="M56,28 C52,50 50,78 52,106 C54,128 60,148 66,162" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" stroke-dasharray="4,3" opacity="0.6"/>
<path d="M74,28 C70,50 68,78 70,106 C72,128 78,148 84,162" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" stroke-dasharray="4,3" opacity="0.6"/>
<path d="M204,28 C208,50 210,78 208,106 C206,128 200,148 194,162" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" stroke-dasharray="4,3" opacity="0.6"/>
<path d="M186,28 C190,50 192,78 190,106 C188,128 182,148 176,162" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" stroke-dasharray="4,3" opacity="0.6"/>
<text x="52" y="24" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif" opacity="0.7">SCM</text>
<text x="190" y="24" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif" opacity="0.7">SCM</text>
<!-- Lymph node zones -->
<text x="130" y="38" text-anchor="middle" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">Zone I</text>
<text x="130" y="48" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">(Submental)</text>
<!-- Zone II labels left/right -->
<text x="40" y="72" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">II</text>
<text x="218" y="72" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">II</text>
<text x="26" y="80" font-size="6" fill="${LANDMARK}" font-family="Arial,sans-serif">Upper Jug.</text>
<text x="210" y="80" font-size="6" fill="${LANDMARK}" font-family="Arial,sans-serif">Upper Jug.</text>
<!-- Zone III -->
<text x="34" y="118" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">III</text>
<text x="222" y="118" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">III</text>
<!-- Zone IV -->
<text x="34" y="160" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">IV</text>
<text x="222" y="160" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">IV</text>
<!-- Zone V posterior triangle -->
<text x="16" y="140" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">V Post.</text>
<text x="218" y="140" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">V Post.</text>
<!-- Zone VI central -->
<text x="130" y="182" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Zone VI (Central)</text>
<!-- hyoid bone -->
<path d="M106,78 Q130,74 154,78" stroke="${SKIN_STROKE}" stroke-width="2" fill="none" stroke-linecap="round"/>
<text x="130" y="70" text-anchor="middle" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Hyoid</text>
</svg>`

const svgNeckLateral = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 300">
<defs>
  <linearGradient id="sk4" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0%" stop-color="${SKIN2}"/>
    <stop offset="100%" stop-color="${SKIN}"/>
  </linearGradient>
</defs>
<!-- neck lateral profile -->
<path d="M80,10 C66,18 56,32 52,50 C48,68 50,88 56,106 C62,122 72,134 82,144 C90,152 100,158 108,160 L132,164 L152,160 C164,154 174,144 182,130 C190,116 196,98 198,80 C200,62 198,44 192,30 C186,18 176,10 164,8 L130,4 Z" fill="url(#sk4)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- lower neck -->
<path d="M80,164 C70,180 62,200 58,222 C54,242 56,260 62,272 C74,282 100,288 130,290 C160,290 186,284 196,272 C202,260 204,242 200,222 C196,200 188,180 178,164 L152,160" fill="url(#sk4)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- clavicle -->
<path d="M40,258 C60,252 90,250 120,252 L142,254" stroke="${SKIN_STROKE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<!-- anterior neck landmarks -->
<!-- thyroid cartilage / larynx -->
<path d="M98,90 C94,96 92,106 94,116 C96,124 102,130 110,132 C116,134 122,132 126,128 C130,124 130,116 128,108 C126,100 120,92 114,88 C108,86 100,86 98,90 Z" fill="none" stroke="${GUIDE}" stroke-width="1.5"/>
<text x="132" y="110" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">Thyroid cart.</text>
<!-- trachea -->
<rect x="96" y="134" width="22" height="50" rx="11" fill="none" stroke="${GUIDE}" stroke-width="1.2"/>
<text x="122" y="158" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">Trachea</text>
<!-- SCM muscle -->
<path d="M60,18 C64,40 66,70 66,100 C66,126 64,148 62,164" stroke="${SKIN_STROKE}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.4"/>
<text x="44" y="96" font-size="8" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">SCM</text>
<!-- posterior triangle -->
<path d="M172,30 C176,60 178,100 174,138 C170,162 162,178 150,188" stroke="${SKIN_STROKE}" stroke-width="1" fill="none" stroke-dasharray="4,3" opacity="0.5"/>
<text x="174" y="90" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Post. Triangle</text>
<!-- hyoid -->
<line x1="86" y1="82" x2="130" y2="80" stroke="${SKIN_STROKE}" stroke-width="2.5" stroke-linecap="round"/>
<text x="132" y="84" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Hyoid</text>
<!-- zone labels lateral -->
<text x="26" y="56" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Zone II</text>
<text x="26" y="102" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Zone III</text>
<text x="26" y="148" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Zone IV</text>
<text x="160" y="80" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Zone V</text>
<!-- reference lines -->
<line x1="20" y1="42" x2="200" y2="42" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="4,4"/>
<line x1="20" y1="88" x2="200" y2="88" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="4,4"/>
<line x1="20" y1="134" x2="200" y2="134" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="4,4"/>
</svg>`

const svgGroinBilateral = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280">
<defs>
  <linearGradient id="sk5" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- lower abdominal wall outline -->
<path d="M20,10 C18,30 18,55 22,78 C26,100 34,118 44,132 C54,146 68,154 84,160 C100,166 118,168 140,168 L160,168 C182,168 200,166 216,160 C232,154 246,146 256,132 C266,118 274,100 278,78 C282,55 282,30 280,10 Z" fill="url(#sk5)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- upper thighs -->
<path d="M44,162 C36,170 28,186 26,204 C24,220 28,238 36,250 C44,262 56,270 70,272 L100,274 L120,270 C126,256 130,240 130,224 C130,208 126,192 118,178 C110,165 96,162 82,162 Z" fill="url(#sk5)" stroke="${SKIN_STROKE}" stroke-width="1.3"/>
<path d="M256,162 C264,170 272,186 274,204 C276,220 272,238 264,250 C256,262 244,270 230,272 L200,274 L180,270 C174,256 170,240 170,224 C170,208 174,192 182,178 C190,165 204,162 218,162 Z" fill="url(#sk5)" stroke="${SKIN_STROKE}" stroke-width="1.3"/>
<!-- midline -->
<line x1="150" y1="8" x2="150" y2="276" stroke="${REF_LINE}" stroke-width="1" stroke-dasharray="6,4"/>
<!-- inguinal ligaments: ASIS to pubic tubercle -->
<line x1="32" y1="80" x2="138" y2="160" stroke="${LANDMARK}" stroke-width="2" stroke-dasharray="5,3"/>
<line x1="268" y1="80" x2="162" y2="160" stroke="${LANDMARK}" stroke-width="2" stroke-dasharray="5,3"/>
<!-- ASIS dots labeled -->
<circle cx="32" cy="80" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="2" y="78" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<circle cx="268" cy="80" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="270" y="78" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<!-- pubic tubercle midline -->
<circle cx="150" cy="162" r="6" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="132" y="180" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Pubic Tub.</text>
<!-- inguinal canal zone left (anatomically right side of patient) -->
<rect x="50" y="98" width="60" height="38" rx="6" fill="rgba(74,144,217,0.12)" stroke="${LANDMARK}" stroke-width="1" stroke-dasharray="4,2"/>
<text x="80" y="111" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Indirect</text>
<text x="80" y="122" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">hernia zone</text>
<!-- direct hernia zone (medial) left -->
<rect x="94" y="102" width="40" height="34" rx="4" fill="rgba(0,180,200,0.1)" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="4,2"/>
<text x="114" y="118" text-anchor="middle" font-size="7" fill="${GUIDE}" font-family="Arial,sans-serif">Direct</text>
<!-- inguinal canal zone right (patient left) -->
<rect x="190" y="98" width="60" height="38" rx="6" fill="rgba(74,144,217,0.12)" stroke="${LANDMARK}" stroke-width="1" stroke-dasharray="4,2"/>
<text x="220" y="111" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Indirect</text>
<text x="220" y="122" text-anchor="middle" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">hernia zone</text>
<!-- direct hernia zone right (medial) -->
<rect x="166" y="102" width="40" height="34" rx="4" fill="rgba(0,180,200,0.1)" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="4,2"/>
<text x="186" y="118" text-anchor="middle" font-size="7" fill="${GUIDE}" font-family="Arial,sans-serif">Direct</text>
<!-- femoral triangles -->
<path d="M56,166 L88,174 L68,232 Z" fill="rgba(232,168,124,0.2)" stroke="${SKIN_STROKE}" stroke-width="1" stroke-dasharray="3,2"/>
<text x="60" y="200" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral</text>
<text x="60" y="208" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">triangle</text>
<path d="M244,166 L212,174 L232,232 Z" fill="rgba(232,168,124,0.2)" stroke="${SKIN_STROKE}" stroke-width="1" stroke-dasharray="3,2"/>
<text x="222" y="200" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral</text>
<text x="222" y="208" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">triangle</text>
<!-- femoral zone label -->
<text x="80" y="238" text-anchor="middle" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral zone</text>
<text x="220" y="238" text-anchor="middle" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral zone</text>
<!-- R / L labels (patient orientation) -->
<text x="60" y="16" text-anchor="middle" font-size="10" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">R</text>
<text x="240" y="16" text-anchor="middle" font-size="10" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">L</text>
</svg>`

const svgGroinRight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280">
<defs>
  <linearGradient id="sk5r" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- close-up right inguinal region -->
<path d="M10,10 C10,40 14,80 22,118 C30,152 42,176 60,196 C80,216 106,228 138,234 L180,238 L220,236 C248,232 272,220 284,204 C294,188 296,162 290,136 C284,108 270,80 254,58 C238,38 218,20 196,12 L150,6 Z" fill="url(#sk5r)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- inguinal ligament -->
<line x1="28" y1="74" x2="180" y2="200" stroke="${LANDMARK}" stroke-width="2.5" stroke-dasharray="7,4"/>
<text x="16" y="72" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<circle cx="28" cy="74" r="8" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<circle cx="180" cy="200" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="162" y="218" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif">Pubic Tub.</text>
<text x="44" y="136" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Inguinal lig.</text>
<!-- indirect hernia zone -->
<ellipse cx="80" cy="126" rx="40" ry="28" fill="rgba(74,144,217,0.15)" stroke="${LANDMARK}" stroke-width="1.5" stroke-dasharray="5,3"/>
<text x="80" y="120" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">Indirect</text>
<text x="80" y="132" text-anchor="middle" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">hernia zone</text>
<!-- direct hernia zone (medial) -->
<ellipse cx="148" cy="148" rx="32" ry="24" fill="rgba(0,180,200,0.12)" stroke="${GUIDE}" stroke-width="1.5" stroke-dasharray="5,3"/>
<text x="148" y="143" text-anchor="middle" font-size="9" fill="${GUIDE}" font-family="Arial,sans-serif" font-weight="600">Direct</text>
<text x="148" y="155" text-anchor="middle" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">hernia zone</text>
<!-- femoral zone -->
<ellipse cx="168" cy="210" rx="30" ry="22" fill="rgba(232,168,124,0.2)" stroke="${SKIN_STROKE}" stroke-width="1.5" stroke-dasharray="4,3"/>
<text x="168" y="205" text-anchor="middle" font-size="9" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral</text>
<text x="168" y="217" text-anchor="middle" font-size="8" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">zone</text>
<!-- internal ring marker -->
<circle cx="68" cy="112" r="9" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="28" y="108" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Int. ring</text>
<!-- external ring marker -->
<circle cx="152" cy="186" r="9" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="158" y="184" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Ext. ring</text>
<text x="150" y="16" text-anchor="middle" font-size="12" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">Right Inguinal Region</text>
</svg>`

const svgGroinLeft = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280">
<defs>
  <linearGradient id="sk5l" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- close-up left inguinal region (mirrored) -->
<path d="M290,10 C290,40 286,80 278,118 C270,152 258,176 240,196 C220,216 194,228 162,234 L120,238 L80,236 C52,232 28,220 16,204 C6,188 4,162 10,136 C16,108 30,80 46,58 C62,38 82,20 104,12 L150,6 Z" fill="url(#sk5l)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- inguinal ligament (mirrored) -->
<line x1="272" y1="74" x2="120" y2="200" stroke="${LANDMARK}" stroke-width="2.5" stroke-dasharray="7,4"/>
<text x="274" y="72" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<circle cx="272" cy="74" r="8" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<circle cx="120" cy="200" r="7" fill="none" stroke="${LANDMARK}" stroke-width="2"/>
<text x="90" y="218" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif">Pubic Tub.</text>
<text x="198" y="136" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">Inguinal lig.</text>
<!-- indirect hernia zone -->
<ellipse cx="220" cy="126" rx="40" ry="28" fill="rgba(74,144,217,0.15)" stroke="${LANDMARK}" stroke-width="1.5" stroke-dasharray="5,3"/>
<text x="220" y="120" text-anchor="middle" font-size="9" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="600">Indirect</text>
<text x="220" y="132" text-anchor="middle" font-size="8" fill="${LANDMARK}" font-family="Arial,sans-serif">hernia zone</text>
<!-- direct hernia zone -->
<ellipse cx="152" cy="148" rx="32" ry="24" fill="rgba(0,180,200,0.12)" stroke="${GUIDE}" stroke-width="1.5" stroke-dasharray="5,3"/>
<text x="152" y="143" text-anchor="middle" font-size="9" fill="${GUIDE}" font-family="Arial,sans-serif" font-weight="600">Direct</text>
<text x="152" y="155" text-anchor="middle" font-size="8" fill="${GUIDE}" font-family="Arial,sans-serif">hernia zone</text>
<!-- femoral zone -->
<ellipse cx="132" cy="210" rx="30" ry="22" fill="rgba(232,168,124,0.2)" stroke="${SKIN_STROKE}" stroke-width="1.5" stroke-dasharray="4,3"/>
<text x="132" y="205" text-anchor="middle" font-size="9" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Femoral</text>
<text x="132" y="217" text-anchor="middle" font-size="8" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">zone</text>
<!-- internal ring -->
<circle cx="232" cy="112" r="9" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="238" y="108" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Int. ring</text>
<!-- external ring -->
<circle cx="148" cy="186" r="9" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="100" y="184" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Ext. ring</text>
<text x="150" y="16" text-anchor="middle" font-size="12" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">Left Inguinal Region</text>
</svg>`

const svgBreastAnterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280">
<defs>
  <linearGradient id="sk6" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
  <radialGradient id="bg" cx="50%" cy="35%" r="60%">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </radialGradient>
</defs>
<!-- neck -->
<path d="M120,8 L114,38 L186,38 L180,8 Z" fill="url(#sk6)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- clavicles -->
<path d="M114,38 Q72,46 40,66" stroke="${SKIN_STROKE}" stroke-width="2" fill="none"/>
<path d="M186,38 Q228,46 260,66" stroke="${SKIN_STROKE}" stroke-width="2" fill="none"/>
<!-- chest wall -->
<path d="M40,66 C38,90 36,116 38,142 C40,166 48,186 58,202 C68,216 80,224 94,230 L150,238 L206,230 C220,224 232,216 242,202 C252,186 260,166 262,142 C264,116 262,90 260,66 Z" fill="url(#sk6)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- midline -->
<line x1="150" y1="38" x2="150" y2="268" stroke="${REF_LINE}" stroke-width="1" stroke-dasharray="5,4"/>
<!-- sternal notch -->
<circle cx="150" cy="42" r="5" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<text x="154" y="40" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Notch</text>
<!-- left breast -->
<path d="M50,82 C46,104 46,130 52,154 C58,174 70,190 84,200 C96,208 108,210 116,208 C124,206 132,198 138,188 C144,176 146,160 144,146 C142,130 136,114 126,102 C116,90 100,82 86,80 C72,78 56,78 50,82 Z" fill="url(#bg)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- right breast -->
<path d="M250,82 C254,104 254,130 248,154 C242,174 230,190 216,200 C204,208 192,210 184,208 C176,206 168,198 162,188 C156,176 154,160 156,146 C158,130 164,114 174,102 C184,90 200,82 214,80 C228,78 244,78 250,82 Z" fill="url(#bg)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- left NAC -->
<circle cx="98" cy="164" r="20" fill="none" stroke="${SKIN_STROKE}" stroke-width="1" opacity="0.5"/>
<circle cx="98" cy="164" r="10" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5" opacity="0.8"/>
<circle cx="98" cy="164" r="4" fill="${SKIN_STROKE}" opacity="0.8"/>
<!-- right NAC -->
<circle cx="202" cy="164" r="20" fill="none" stroke="${SKIN_STROKE}" stroke-width="1" opacity="0.5"/>
<circle cx="202" cy="164" r="10" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5" opacity="0.8"/>
<circle cx="202" cy="164" r="4" fill="${SKIN_STROKE}" opacity="0.8"/>
<!-- quadrant lines left breast centered on nipple -->
<line x1="98" y1="80" x2="98" y2="230" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="3,3"/>
<line x1="46" y1="164" x2="152" y2="164" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="3,3"/>
<!-- quadrant lines right breast -->
<line x1="202" y1="80" x2="202" y2="230" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="3,3"/>
<line x1="152" y1="164" x2="258" y2="164" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="3,3"/>
<!-- quadrant labels left -->
<text x="68" y="130" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">UO</text>
<text x="104" y="130" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">UI</text>
<text x="68" y="198" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">LO</text>
<text x="104" y="198" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">LI</text>
<!-- quadrant labels right -->
<text x="172" y="130" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">UI</text>
<text x="212" y="130" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">UO</text>
<text x="172" y="198" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">LI</text>
<text x="212" y="198" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">LO</text>
<!-- axillary tail left -->
<path d="M50,82 C44,72 42,62 46,54" stroke="${SKIN_STROKE}" stroke-width="1" fill="none" stroke-dasharray="3,2" opacity="0.5"/>
<text x="20" y="62" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Axill. tail</text>
<!-- axillary tail right -->
<path d="M250,82 C256,72 258,62 254,54" stroke="${SKIN_STROKE}" stroke-width="1" fill="none" stroke-dasharray="3,2" opacity="0.5"/>
<text x="255" y="62" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">Axill. tail</text>
<!-- sentinel node zones (axilla) -->
<ellipse cx="34" cy="82" rx="16" ry="20" fill="rgba(74,144,217,0.12)" stroke="${LANDMARK}" stroke-width="1" stroke-dasharray="3,2"/>
<text x="8" y="76" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">SLN</text>
<ellipse cx="266" cy="82" rx="16" ry="20" fill="rgba(74,144,217,0.12)" stroke="${LANDMARK}" stroke-width="1" stroke-dasharray="3,2"/>
<text x="268" y="76" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">SLN</text>
<!-- IMF lines -->
<path d="M48,212 Q90,228 118,224 Q136,222 144,218" stroke="${LANDMARK}" stroke-width="1.8" fill="none" stroke-dasharray="4,2"/>
<path d="M252,212 Q210,228 182,224 Q164,222 156,218" stroke="${LANDMARK}" stroke-width="1.8" fill="none" stroke-dasharray="4,2"/>
<text x="10" y="220" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">IMF</text>
<text x="272" y="220" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">IMF</text>
<!-- R / L patient labels -->
<text x="42" y="275" font-size="10" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">R</text>
<text x="246" y="275" font-size="10" fill="${LANDMARK}" font-family="Arial,sans-serif" font-weight="700">L</text>
</svg>`

const svgBodyAnterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 500">
<defs>
  <linearGradient id="sk7" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- head -->
<ellipse cx="130" cy="40" rx="30" ry="36" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- eyes (simple) -->
<circle cx="118" cy="37" r="3" fill="${SKIN_STROKE}" opacity="0.6"/>
<circle cx="142" cy="37" r="3" fill="${SKIN_STROKE}" opacity="0.6"/>
<!-- nose -->
<path d="M130,42 L127,50 Q130,52 133,50 L130,42" stroke="${SKIN_STROKE}" stroke-width="0.9" fill="none"/>
<!-- neck -->
<path d="M116,74 L110,100 L150,100 L144,74 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- left arm -->
<path d="M62,124 C54,132 46,152 44,174 C42,192 44,208 48,222 L58,232 L68,226 C65,210 63,192 64,172 C65,152 70,134 72,126 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M48,222 C42,236 38,252 38,268 L54,280 C56,266 58,252 60,238 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M38,270 C34,278 34,286 40,292 C46,296 54,294 58,288 L54,280 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- right arm -->
<path d="M198,124 C206,132 214,152 216,174 C218,192 216,208 212,222 L202,232 L192,226 C195,210 197,192 196,172 C195,152 190,134 188,126 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M212,222 C218,236 222,252 222,268 L206,280 C204,266 202,252 200,238 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M222,270 C226,278 226,286 220,292 C214,296 206,294 202,288 L206,280 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- torso -->
<path d="M72,126 C78,116 100,106 116,100 L144,100 C160,106 182,116 188,126 C204,138 212,158 212,182 C212,206 206,226 202,242 C198,256 192,268 188,278 L180,290 C174,298 168,304 160,306 L100,306 C92,304 86,298 80,290 L72,278 C68,268 62,256 58,242 C54,226 48,206 48,182 C48,158 56,138 72,126 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- midline -->
<line x1="130" y1="100" x2="130" y2="306" stroke="${REF_LINE}" stroke-width="0.8" stroke-dasharray="5,4"/>
<!-- umbilicus -->
<ellipse cx="130" cy="228" rx="5.5" ry="6" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- costal margin -->
<path d="M72,130 Q100,142 130,140 Q160,142 188,130" stroke="${SKIN_STROKE}" stroke-width="1" fill="none" opacity="0.5" stroke-dasharray="3,3"/>
<!-- ASIS landmarks -->
<circle cx="68" cy="286" r="5" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<circle cx="192" cy="286" r="5" fill="none" stroke="${LANDMARK}" stroke-width="1.5"/>
<!-- suprapubic -->
<path d="M108,300 Q130,294 152,300" stroke="${SKIN_STROKE}" stroke-width="1" fill="none" opacity="0.5"/>
<!-- left leg -->
<path d="M100,306 C90,312 80,330 76,356 C72,378 72,398 74,416 C76,430 80,446 82,460 L94,468 L106,464 C108,450 112,434 114,418 C116,400 116,380 114,357 C112,332 106,314 104,306 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<ellipse cx="88" cy="438" rx="14" ry="18" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1"/>
<path d="M82,460 C78,474 76,486 76,494 C76,498 79,500 84,500 L100,500 L104,496 C104,488 102,474 100,462 L94,468 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- right leg -->
<path d="M160,306 C170,312 180,330 184,356 C188,378 188,398 186,416 C184,430 180,446 178,460 L166,468 L154,464 C152,450 148,434 146,418 C144,400 144,380 146,357 C148,332 154,314 156,306 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<ellipse cx="172" cy="438" rx="14" ry="18" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1"/>
<path d="M178,460 C182,474 184,486 184,494 C184,498 181,500 176,500 L160,500 L156,496 C156,488 158,474 160,462 L166,468 Z" fill="url(#sk7)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- surgical landmark labels -->
<text x="34" y="290" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<text x="196" y="290" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">ASIS</text>
<text x="134" y="228" font-size="7" fill="${SKIN_STROKE}" font-family="Arial,sans-serif">UMB</text>
</svg>`

const svgBodyPosterior = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 500">
<defs>
  <linearGradient id="sk8" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${SKIN}"/>
    <stop offset="100%" stop-color="${SKIN2}"/>
  </linearGradient>
</defs>
<!-- head (back) -->
<ellipse cx="130" cy="40" rx="30" ry="36" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- neck -->
<path d="M114,74 L108,100 L152,100 L146,74 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- left arm back -->
<path d="M60,124 C52,132 44,152 42,174 C40,192 42,208 46,222 L56,232 L66,226 C63,210 61,192 62,172 C63,152 68,134 70,126 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M46,222 C40,236 36,252 36,268 L52,280 C54,266 56,252 58,238 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M36,270 C32,278 32,286 38,292 L52,280 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- right arm back -->
<path d="M200,124 C208,132 216,152 218,174 C220,192 218,208 214,222 L204,232 L194,226 C197,210 199,192 198,172 C197,152 192,134 190,126 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M214,222 C220,236 224,252 224,268 L208,280 C206,266 204,252 202,238 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<path d="M224,270 C228,278 228,286 222,292 L208,280 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- torso back -->
<path d="M70,126 C76,116 100,106 114,100 L146,100 C160,106 184,116 190,126 C206,138 214,158 214,182 C214,206 208,226 204,242 C200,256 194,268 190,278 L182,290 C176,298 170,304 162,306 L98,306 C90,304 84,298 78,290 L70,278 C66,268 60,256 56,242 C52,226 46,206 46,182 C46,158 54,138 70,126 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- spine midline dashed -->
<line x1="130" y1="100" x2="130" y2="306" stroke="rgba(0,212,255,0.4)" stroke-width="1" stroke-dasharray="5,4"/>
<text x="133" y="140" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Spine</text>
<!-- scapulae -->
<ellipse cx="102" cy="150" rx="20" ry="28" fill="none" stroke="${GUIDE}" stroke-width="1.2" opacity="0.6" transform="rotate(-10 102 150)"/>
<ellipse cx="158" cy="150" rx="20" ry="28" fill="none" stroke="${GUIDE}" stroke-width="1.2" opacity="0.6" transform="rotate(10 158 150)"/>
<!-- iliac crests -->
<path d="M46,254 C64,244 96,240 118,242 L130,244" stroke="${LANDMARK}" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M214,254 C196,244 164,240 142,242 L130,244" stroke="${LANDMARK}" stroke-width="2" fill="none" stroke-linecap="round"/>
<!-- lumbar dimples -->
<circle cx="116" cy="268" r="5" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<circle cx="144" cy="268" r="5" fill="none" stroke="${SKIN_STROKE}" stroke-width="1.5"/>
<!-- sacrum -->
<path d="M112,278 C112,292 118,304 128,310 C134,312 126,312 130,312 C134,312 136,312 132,310 C142,304 148,292 148,278 Z" fill="none" stroke="${GUIDE}" stroke-width="1.2"/>
<!-- gluteal fold -->
<path d="M80,300 Q130,312 180,300" stroke="${SKIN_STROKE}" stroke-width="1.2" fill="none" opacity="0.6"/>
<!-- left leg back -->
<path d="M98,306 C88,312 78,330 74,356 C70,378 70,398 72,416 C74,430 78,446 80,460 L92,468 L104,464 C106,450 110,434 112,418 C114,400 114,380 112,357 C110,332 104,314 102,306 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<ellipse cx="86" cy="438" rx="14" ry="18" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1"/>
<path d="M80,460 C76,474 74,486 74,494 C74,498 77,500 82,500 L98,500 L102,496 C102,488 100,474 98,462 L92,468 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- right leg back -->
<path d="M162,306 C172,312 182,330 186,356 C190,378 190,398 188,416 C186,430 182,446 180,460 L168,468 L156,464 C154,450 150,434 148,418 C146,400 146,380 148,357 C150,332 156,314 158,306 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<ellipse cx="174" cy="438" rx="14" ry="18" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1"/>
<path d="M180,460 C184,474 186,486 186,494 C186,498 183,500 178,500 L162,500 L158,496 C158,488 160,474 162,462 L168,468 Z" fill="url(#sk8)" stroke="${SKIN_STROKE}" stroke-width="1.2"/>
<!-- landmark labels -->
<text x="22" y="258" font-size="7" fill="${LANDMARK}" font-family="Arial,sans-serif">Iliac crest</text>
</svg>`

// ── Template data structure ────────────────────────────────────────────────────────────────────────

const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

interface TemplateView { name: string; svg: string; aspectRatio: number }
interface TemplateGroup { label: string; icon: string; views: TemplateView[] }

const TEMPLATES: Record<string, TemplateGroup> = {
  abdomen: {
    label: 'Abdomen', icon: '◉',
    views: [
      { name: 'Anterior', svg: svgAbdomenAnterior, aspectRatio: 300 / 420 },
      { name: 'Posterior', svg: svgAbdomenPosterior, aspectRatio: 300 / 420 },
    ],
  },
  neck: {
    label: 'Neck', icon: '▭',
    views: [
      { name: 'Anterior', svg: svgNeckAnterior, aspectRatio: 260 / 300 },
      { name: 'Lateral', svg: svgNeckLateral, aspectRatio: 260 / 300 },
    ],
  },
  groin: {
    label: 'Groin / Inguinal', icon: '⊓',
    views: [
      { name: 'Bilateral', svg: svgGroinBilateral, aspectRatio: 300 / 280 },
      { name: 'Right', svg: svgGroinRight, aspectRatio: 300 / 280 },
      { name: 'Left', svg: svgGroinLeft, aspectRatio: 300 / 280 },
    ],
  },
  breast: {
    label: 'Breast', icon: '◎',
    views: [
      { name: 'Anterior', svg: svgBreastAnterior, aspectRatio: 300 / 280 },
    ],
  },
  body: {
    label: 'Full Body', icon: '⬡',
    views: [
      { name: 'Anterior', svg: svgBodyAnterior, aspectRatio: 260 / 500 },
      { name: 'Posterior', svg: svgBodyPosterior, aspectRatio: 260 / 500 },
    ],
  },
}

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'draw' | 'marker' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'eraser'

interface Stamp { label: string; icon: string; action: (canvas: any, x: number, y: number, color: string) => void }

interface Props {
  encounterId: string
  patientId: string
  orgId: string
  procedureType?: keyof typeof TEMPLATES
  onSave?: (drawingId: string) => void
}

// ── Surgical annotation stamps ─────────────────────────────────────────────────────────────────────

function makeStamps(fabric: any): Stamp[] {
  return [
    {
      label: 'Incision', icon: '—',
      action: (c, x, y, color) => {
        const line = new fabric.Line([x - 40, y, x + 40, y], { stroke: color, strokeWidth: 2, strokeDashArray: [6, 3], selectable: true })
        c.add(line)
      },
    },
    {
      label: 'X Mark', icon: '✕',
      action: (c, x, y, color) => {
        const g = new fabric.Group([
          new fabric.Line([x - 12, y - 12, x + 12, y + 12], { stroke: color, strokeWidth: 2.5 }),
          new fabric.Line([x + 12, y - 12, x - 12, y + 12], { stroke: color, strokeWidth: 2.5 }),
        ], { selectable: true })
        c.add(g)
      },
    },
    {
      label: 'Dot / NAV', icon: '●',
      action: (c, x, y, color) => {
        const circle = new fabric.Circle({ left: x - 6, top: y - 6, radius: 6, fill: color, selectable: true })
        c.add(circle)
      },
    },
    {
      label: 'Hatch Zone', icon: '▩',
      action: (c, x, y, color) => {
        const lines = []
        for (let i = -3; i <= 3; i++) {
          lines.push(new fabric.Line([x - 28 + i * 8, y - 24, x - 28 + i * 8 + 24, y + 24], { stroke: color, strokeWidth: 1.5, opacity: 0.7 }))
        }
        const g = new fabric.Group(lines, { selectable: true })
        c.add(g)
      },
    },
    {
      label: 'IMF Line', icon: '⌒',
      action: (c, x, y, color) => {
        const path = new fabric.Path(`M ${x - 50},${y} Q ${x},${y + 20} ${x + 50},${y}`, {
          stroke: color, strokeWidth: 2, fill: 'transparent', strokeDashArray: [5, 3], selectable: true,
        })
        c.add(path)
      },
    },
    {
      label: 'Circle Zone', icon: '○',
      action: (c, x, y, color) => {
        const circle = new fabric.Circle({ left: x - 30, top: y - 30, radius: 30, fill: 'transparent', stroke: color, strokeWidth: 2, strokeDashArray: [4, 3], selectable: true })
        c.add(circle)
      },
    },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────────

export default function SurgicalDrawingTool({ encounterId, patientId, orgId, procedureType = 'abdomen', onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricRef = useRef<any>(null)
  const arrowStartRef = useRef<{ x: number; y: number } | null>(null)
  const penActiveRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDrawingRef = useRef<(() => void) | null>(null)

  const [fabricLoaded, setFabricLoaded] = useState(false)
  const [activeTool, setActiveTool] = useState<Tool>('draw')
  const [activeColor, setActiveColor] = useState('#e74c3c')
  const [brushSize, setBrushSize] = useState(4)
  const [activeTemplate, setActiveTemplate] = useState<keyof typeof TEMPLATES>(
    procedureType in TEMPLATES ? procedureType : 'abdomen'
  )
  const [activeView, setActiveView] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 540 })
  const [showStamps, setShowStamps] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const [loadingDrawing, setLoadingDrawing] = useState(false)
  const [photos, setPhotos] = useState<{ photo_id: string; photo_url: string; photo_type: string; view_label: string | null; storage_path: string }[]>([])
  const [showPhotoPanel, setShowPhotoPanel] = useState(false)
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoFileInputRef = useRef<HTMLInputElement>(null)

  const colors = [
    '#1a1a1a', '#e74c3c', '#e67e22', '#f1c40f',
    '#2ecc71', '#3498db', '#9b59b6', '#1abc9c',
    '#0044CC', '#CC0000', '#00AA44', '#8B15CC',
    '#ffffff',
  ]

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (w: number) => {
      const template = TEMPLATES[activeTemplate]
      const ar = template.views[activeView]?.aspectRatio ?? (260 / 500)
      const cw = Math.min(Math.max(w - 32, 320), 1200)
      const ch = Math.round(cw / ar)
      setCanvasSize({ width: cw, height: Math.min(ch, window.innerHeight - 220) })
    }
    const ro = new ResizeObserver(entries => update(entries[0].contentRect.width))
    ro.observe(el)
    update(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [activeTemplate, activeView])

  useEffect(() => {
    if ((window as any).fabric) { setFabricLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js'
    script.onload = () => setFabricLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return
    const fabric = (window as any).fabric

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: '#ffffff',
      enableRetinaScaling: true,
      allowTouchScrolling: false,
    })

    canvas.freeDrawingBrush.color = activeColor
    canvas.freeDrawingBrush.width = brushSize
    canvas.freeDrawingBrush.decimate = 2

    canvas.on('object:added', () => pushHistory(canvas))
    canvas.on('object:modified', () => pushHistory(canvas))
    canvas.on('object:removed', () => pushHistory(canvas))

    canvas.on('path:created', () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        setSaveStatus('idle')
        saveDrawingRef.current?.()
      }, 2000)
    })

    fabricRef.current = canvas
    loadTemplate(canvas, activeTemplate, activeView, canvasSize)

    const templateKey = `${activeTemplate}:${TEMPLATES[activeTemplate].views[activeView].name}`
    setLoadingDrawing(true)
    supabase.schema('cr').from('surgical_drawings')
      .select('drawing_json')
      .eq('encounter_id', encounterId)
      .eq('template_key', templateKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.drawing_json) {
          canvas.loadFromJSON(data.drawing_json, () => {
            canvas.renderAll()
            loadTemplate(canvas, activeTemplate, activeView, canvasSize)
          })
        }
        setLoadingDrawing(false)
      })
      .catch(() => setLoadingDrawing(false))

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      canvas.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricLoaded])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    canvas.setWidth(canvasSize.width)
    canvas.setHeight(canvasSize.height)
    canvas.renderAll()
  }, [canvasSize, fabricLoaded])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen' && fabricRef.current?.isDrawingMode) {
        const pressure = Math.max(e.pressure, 0.2)
        if (fabricRef.current.freeDrawingBrush) {
          fabricRef.current.freeDrawingBrush.width = brushSize * pressure * 2.5
        }
      }
    }
    el.addEventListener('pointermove', handlePointerMove)
    return () => el.removeEventListener('pointermove', handlePointerMove)
  }, [isTouch, brushSize])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return
    const prevent = (e: TouchEvent) => { if (fabricRef.current?.isDrawingMode) e.preventDefault() }
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [isTouch])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return

    const onPenDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') penActiveRef.current = true
    }
    const onPenUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        setTimeout(() => { penActiveRef.current = false }, 120)
      }
    }
    const blockPalmTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && penActiveRef.current) e.stopImmediatePropagation()
    }

    el.addEventListener('pointerdown', onPenDown, { capture: true })
    el.addEventListener('pointerup', onPenUp, { capture: true })
    el.addEventListener('pointercancel', onPenUp, { capture: true })
    el.addEventListener('pointerdown', blockPalmTouch, { capture: true })
    el.addEventListener('pointermove', blockPalmTouch, { capture: true })

    return () => {
      el.removeEventListener('pointerdown', onPenDown, { capture: true })
      el.removeEventListener('pointerup', onPenUp, { capture: true })
      el.removeEventListener('pointercancel', onPenUp, { capture: true })
      el.removeEventListener('pointerdown', blockPalmTouch, { capture: true })
      el.removeEventListener('pointermove', blockPalmTouch, { capture: true })
    }
  }, [isTouch])

  const loadTemplate = useCallback((canvas: any, templateKey: string, viewIndex: number, size: { width: number; height: number }) => {
    if (!canvas) return
    const fabric = (window as any).fabric
    const template = TEMPLATES[templateKey]
    if (!template) return
    const view = template.views[viewIndex]
    if (!view) return

    const uri = toDataUri(view.svg)
    canvas.setBackgroundImage(null, () => {})

    fabric.Image.fromURL(uri, (img: any) => {
      if (!img) return
      const scale = Math.min(size.width / (img.width || size.width), size.height / (img.height || size.height)) * 0.88
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (size.width - (img.width || 0) * scale) / 2,
        top: (size.height - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
        opacity: 1,
      })
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
    }, { crossOrigin: 'anonymous' })
  }, [])

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.schema('cr').from('patient_photos')
      .select('photo_id,photo_url,photo_type,view_label,storage_path')
      .eq('encounter_id', encounterId)
      .eq('is_active', true)
      .order('captured_at', { ascending: false })
    setPhotos(data ?? [])
  }, [encounterId])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const uploadAndUsePhoto = useCallback(async (file: File) => {
    setUploadingPhoto(true)
    try {
      const blob = await new Promise<Blob>(resolve => {
        const img = new window.Image()
        img.onload = () => {
          const scale = Math.min(1, 1600 / img.width)
          const c = document.createElement('canvas')
          c.width = Math.round(img.width * scale)
          c.height = Math.round(img.height * scale)
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0, c.width, c.height)
          c.toBlob(b => resolve(b!), 'image/jpeg', 0.88)
          URL.revokeObjectURL(img.src)
        }
        img.src = URL.createObjectURL(file)
      })
      const ts   = Date.now()
      const path = `${orgId}/patients/${encounterId}/${ts}_drawing_background.jpg`
      const { error: se } = await supabase.storage.from('revela-assets').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (se) throw se
      const { data: ud } = supabase.storage.from('revela-assets').getPublicUrl(path)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.schema('cr').from('patient_photos').insert({
        org_id: orgId, encounter_id: encounterId, storage_path: path,
        photo_url: ud.publicUrl, photo_type: 'drawing_background',
        file_size_bytes: blob.size, mime_type: 'image/jpeg',
        captured_by: user?.id ?? null,
      })
      setActivePhotoUrl(ud.publicUrl)
      await loadPhotos()
    } catch {
      // silently ignore
    } finally {
      setUploadingPhoto(false)
    }
  }, [orgId, encounterId, loadPhotos])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    if (!activePhotoUrl) {
      loadTemplate(canvas, activeTemplate, activeView, canvasSize)
      return
    }
    const fabric = (window as any).fabric
    fabric.Image.fromURL(activePhotoUrl, (img: any) => {
      if (!img) return
      const scaleX = canvasSize.width  / (img.width  || canvasSize.width)
      const scaleY = canvasSize.height / (img.height || canvasSize.height)
      const scale  = Math.max(scaleX, scaleY)
      img.set({
        scaleX: scale, scaleY: scale,
        left: (canvasSize.width  - (img.width  || 0) * scale) / 2,
        top:  (canvasSize.height - (img.height || 0) * scale) / 2,
        selectable: false, evented: false,
      })
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
    }, { crossOrigin: 'anonymous' })
  }, [activePhotoUrl, fabricLoaded, canvasSize])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    if (!activePhotoUrl) {
      loadTemplate(canvas, activeTemplate, activeView, canvasSize)
    }
    setHistory([])
    setHistoryIndex(-1)
  }, [activeTemplate, activeView, fabricLoaded, loadTemplate, canvasSize])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const fabric = (window as any).fabric
    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.off('mouse:down')

    switch (activeTool) {
      case 'draw':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = activeColor
        canvas.freeDrawingBrush.width = brushSize
        canvas.freeDrawingBrush.decimate = 2
        break
      case 'marker':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = activeColor + '70'
        canvas.freeDrawingBrush.width = brushSize * 5
        canvas.freeDrawingBrush.decimate = 4
        break
      case 'eraser':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = '#ffffff'
        canvas.freeDrawingBrush.width = brushSize * 6
        canvas.freeDrawingBrush.decimate = 4
        break
      case 'select':
        canvas.selection = true
        break
      case 'text':
        canvas.on('mouse:down', handleTextAdd)
        break
      case 'rect':
        canvas.on('mouse:down', handleRectAdd)
        break
      case 'circle':
        canvas.on('mouse:down', handleCircleAdd)
        break
      case 'line':
        canvas.on('mouse:down', handleLineAdd)
        break
      case 'arrow':
        canvas.on('mouse:down', handleArrowStart)
        canvas.on('mouse:up', handleArrowEnd)
        break
    }
    return () => {
      if (canvas) {
        canvas.off('mouse:down')
        canvas.off('mouse:up')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, activeColor, brushSize])

  const handleTextAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    const text = new fabric.IText('Label', {
      left: pointer.x, top: pointer.y,
      fontSize: isTouch ? 18 : 14, fill: activeColor,
      fontFamily: 'Arial, sans-serif', fontWeight: 'bold', editable: true,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    text.enterEditing()
    canvas.off('mouse:down', handleTextAdd)
    setActiveTool('select')
  }, [activeColor, isTouch])

  const handleRectAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Rect({ left: pointer.x - 40, top: pointer.y - 25, width: 80, height: 50, fill: 'transparent', stroke: activeColor, strokeWidth: 2, rx: 4 }))
    canvas.off('mouse:down', handleRectAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleCircleAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Circle({ left: pointer.x - 30, top: pointer.y - 30, radius: 30, fill: 'transparent', stroke: activeColor, strokeWidth: 2 }))
    canvas.off('mouse:down', handleCircleAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleLineAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Line([pointer.x - 40, pointer.y, pointer.x + 40, pointer.y], { stroke: activeColor, strokeWidth: 2 }))
    canvas.off('mouse:down', handleLineAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleArrowStart = useCallback((opt: any) => {
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    arrowStartRef.current = { x: pointer.x, y: pointer.y }
  }, [])

  const handleArrowEnd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const start = arrowStartRef.current
    if (!start) return
    const pointer = canvas.getPointer(opt.e)
    const dx = pointer.x - start.x
    const dy = pointer.y - start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 10) { arrowStartRef.current = null; return }
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const headLen = Math.min(20, len * 0.35)
    const line = new fabric.Line([start.x, start.y, pointer.x, pointer.y], { stroke: activeColor, strokeWidth: 2.5 })
    const head = new fabric.Triangle({ width: headLen, height: headLen * 1.2, fill: activeColor, left: pointer.x, top: pointer.y, angle: angle + 90, originX: 'center', originY: 'center' })
    canvas.add(new fabric.Group([line, head], { selectable: true }))
    arrowStartRef.current = null
    setActiveTool('select')
  }, [activeColor])

  const applyStamp = useCallback((stamp: Stamp) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    if (!canvas || !fabric) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    stamp.action(canvas, cx, cy, activeColor)
    setShowStamps(false)
    setActiveTool('select')
  }, [activeColor])

  const pushHistory = (canvas: any) => {
    const json = JSON.stringify(canvas.toJSON())
    setHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), json]
      setHistoryIndex(next.length - 1)
      return next
    })
  }

  const undo = () => {
    const canvas = fabricRef.current
    if (!canvas || historyIndex <= 0) return
    const ni = historyIndex - 1
    canvas.loadFromJSON(history[ni], canvas.renderAll.bind(canvas))
    setHistoryIndex(ni)
  }

  const redo = () => {
    const canvas = fabricRef.current
    if (!canvas || historyIndex >= history.length - 1) return
    const ni = historyIndex + 1
    canvas.loadFromJSON(history[ni], canvas.renderAll.bind(canvas))
    setHistoryIndex(ni)
  }

  const clearDrawing = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.getObjects().forEach((obj: any) => canvas.remove(obj))
    canvas.renderAll()
  }

  const saveDrawing = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      const svgData = canvas.toSVG()
      const jsonData = JSON.stringify(canvas.toJSON())
      const templateInfo = `${activeTemplate}:${TEMPLATES[activeTemplate].views[activeView].name}`
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .schema('cr').from('surgical_drawings')
        .upsert(
          {
            encounter_id: encounterId,
            org_id: orgId,
            template_key: templateInfo,
            drawing_svg: svgData,
            drawing_json: jsonData,
            created_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'encounter_id,template_key' },
        )
        .select('id').single()
      if (error) throw error
      setSaveStatus('saved')
      onSave?.(data.id)
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch { setSaveStatus('error') } finally { setSaving(false) }
  }, [activeTemplate, activeView, encounterId, orgId, onSave])

  useEffect(() => { saveDrawingRef.current = saveDrawing }, [saveDrawing])

  const exportPng = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL({ format: 'png', multiplier: 2 })
    a.download = `drawing-${encounterId}-${activeTemplate}.png`
    a.click()
  }

  const template = TEMPLATES[activeTemplate]
  const btnH = isTouch ? 48 : 36
  const fontSize = isTouch ? 14 : 12

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'select', icon: '↖', label: 'Select' },
    { id: 'draw', icon: '✏', label: 'Draw' },
    { id: 'marker', icon: '▮', label: 'Marker' },
    { id: 'line', icon: '╱', label: 'Line' },
    { id: 'arrow', icon: '→', label: 'Arrow' },
    { id: 'rect', icon: '▭', label: 'Rect' },
    { id: 'circle', icon: '○', label: 'Circle' },
    { id: 'text', icon: 'T', label: 'Text' },
    { id: 'eraser', icon: '⌫', label: 'Erase' },
  ]

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', background: '#060e1c', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,169,110,0.2)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#0a1628', padding: `10px ${isTouch ? 16 : 14}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(201,169,110,0.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polygon points="9,1 17,9 9,17 1,9" fill="none" stroke="#c9a96e" strokeWidth="1.2"/>
            <polygon points="9,5 13,9 9,13 5,9" fill="#c9a96e" opacity="0.4"/>
          </svg>
          <span style={{ color: '#c9a96e', fontSize: 14, fontWeight: 600, letterSpacing: '0.3px' }}>Surgical Drawing</span>
          {isTouch && <span style={{ fontSize: 10, color: 'rgba(201,169,110,0.5)', marginLeft: 4 }}>Apple Pencil ready</span>}
          {activePhotoUrl && <span style={{ fontSize: 10, background: 'rgba(201,169,110,0.15)', color: '#c9a96e', border: '1px solid rgba(201,169,110,0.35)', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>Photo Mode</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportPng} style={btn('ghost', false, btnH, fontSize)}>Export PNG</button>
          <button onClick={saveDrawing} disabled={saving} style={btn('gold', saving, btnH, fontSize)}>
            {saving ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save'}
          </button>
        </div>
      </div>

      {/* Template tabs */}
      <div style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, padding: `8px ${isTouch ? 12 : 10}px`, minWidth: 'max-content' }}>
          {Object.entries(TEMPLATES).map(([key, tmpl]) => (
            <button key={key}
              onClick={() => { setActiveTemplate(key as keyof typeof TEMPLATES); setActiveView(0) }}
              style={{ padding: `${isTouch ? '10px 16px' : '7px 12px'}`, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: isTouch ? 14 : 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: activeTemplate === key ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.04)',
                color: activeTemplate === key ? '#c9a96e' : 'rgba(255,255,255,0.5)',
                outline: activeTemplate === key ? '1px solid rgba(201,169,110,0.4)' : 'none',
              }}>
              <span style={{ marginRight: 6 }}>{tmpl.icon}</span>{tmpl.label}
            </button>
          ))}
        </div>
        {template.views.length > 1 && (
          <div style={{ display: 'flex', gap: 2, padding: `0 ${isTouch ? 12 : 10}px 8px`, minWidth: 'max-content' }}>
            {template.views.map((v, i) => (
              <button key={i} onClick={() => setActiveView(i)}
                style={{ padding: `${isTouch ? '8px 14px' : '5px 10px'}`, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: isTouch ? 13 : 11, fontWeight: 500,
                  background: activeView === i ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: activeView === i ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                }}>
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ background: '#0d1f3c', padding: `${isTouch ? 10 : 8}px ${isTouch ? 12 : 10}px`, display: 'flex', alignItems: 'center', gap: isTouch ? 8 : 6, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>

        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4, flexWrap: 'wrap' }}>
          {tools.map(t => (
            <button key={t.id} title={t.label} onClick={() => { setActiveTool(t.id); setShowStamps(false) }}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: isTouch ? 16 : 14, fontWeight: 700,
                background: activeTool === t.id ? '#c9a96e' : 'rgba(255,255,255,0.07)',
                color: activeTool === t.id ? '#060e1c' : 'rgba(255,255,255,0.65)',
                boxShadow: activeTool === t.id ? '0 2px 8px rgba(201,169,110,0.4)' : 'none',
                transition: 'all 0.12s',
              }}>
              {t.icon}
            </button>
          ))}
          {/* Stamp button */}
          <div style={{ position: 'relative' }}>
            <button title="Stamps" onClick={() => setShowStamps(s => !s)}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: isTouch ? 16 : 14, fontWeight: 700,
                background: showStamps ? '#c9a96e' : 'rgba(255,255,255,0.07)',
                color: showStamps ? '#060e1c' : 'rgba(255,255,255,0.65)',
              }}>
              ⊕
            </button>
            {showStamps && fabricLoaded && (
              <div style={{ position: 'absolute', top: btnH + 6, left: 0, background: '#0d1f3c', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 10, padding: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {makeStamps((window as any).fabric).map(stamp => (
                  <button key={stamp.label} onClick={() => applyStamp(stamp)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${isTouch ? 10 : 7}px 12px`, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: isTouch ? 14 : 12,
                      background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 16, color: activeColor }}>{stamp.icon}</span> {stamp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Photo background button */}
          <div style={{ position: 'relative' }}>
            <button
              title={activePhotoUrl ? 'Clear photo background' : 'Add photo background'}
              onClick={() => { setShowPhotoPanel(s => !s) }}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: activePhotoUrl ? '1.5px solid rgba(201,169,110,0.6)' : 'none', cursor: 'pointer', fontSize: isTouch ? 15 : 13,
                background: showPhotoPanel ? '#c9a96e' : activePhotoUrl ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.07)',
                color: showPhotoPanel ? '#060e1c' : activePhotoUrl ? '#c9a96e' : 'rgba(255,255,255,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: isTouch ? 52 : 44,
              }}
            >
              {activePhotoUrl ? 'Photo ON' : 'Photo'}
            </button>
            {showPhotoPanel && (
              <div style={{ position: 'absolute', top: btnH + 8, left: 0, background: '#0a1628', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 12, padding: 14, zIndex: 200, width: 280, boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
                <div style={{ color: '#c9a96e', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Photo Background</div>
                <input ref={photoFileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setShowPhotoPanel(false); uploadAndUsePhoto(f) } }}
                />
                <button
                  onClick={() => photoFileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px dashed rgba(201,169,110,0.4)', background: 'transparent', color: '#c9a96e', fontSize: 12, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: uploadingPhoto ? 0.6 : 1 }}
                >
                  {uploadingPhoto ? 'Uploading...' : 'Camera / Upload New'}
                </button>
                {photos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {photos.map(p => (
                      <div key={p.photo_id}
                        onClick={() => { setActivePhotoUrl(activePhotoUrl === p.photo_url ? null : p.photo_url); setShowPhotoPanel(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                          background: activePhotoUrl === p.photo_url ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.04)',
                          border: activePhotoUrl === p.photo_url ? '1px solid rgba(201,169,110,0.4)' : '1px solid transparent',
                        }}
                      >
                        <img src={p.photo_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{p.photo_type.replace('_', ' ')}</div>
                          {p.view_label && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{p.view_label}</div>}
                        </div>
                        {activePhotoUrl === p.photo_url && <span style={{ color: '#c9a96e', fontSize: 14 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                )}
                {photos.length === 0 && !uploadingPhoto && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: 0 }}>No photos yet. Tap Camera above to add one.</p>
                )}
                {activePhotoUrl && (
                  <button
                    onClick={() => { setActivePhotoUrl(null); setShowPhotoPanel(false) }}
                    style={{ width: '100%', marginTop: 10, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}
                  >
                    Clear Photo Background
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Color palette */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4, flexWrap: 'wrap' }}>
          {colors.map(c => (
            <button key={c} onClick={() => setActiveColor(c)}
              style={{ width: isTouch ? 32 : 24, height: isTouch ? 32 : 24, borderRadius: '50%', border: activeColor === c ? '3px solid #c9a96e' : '2px solid transparent',
                background: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : activeColor === c ? '0 0 8px rgba(201,169,110,0.6)' : 'none',
                transition: 'border 0.1s, box-shadow 0.1s',
              }}/>
          ))}
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Brush size */}
        {isTouch ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Size</span>
            {[2, 4, 8, 14].map(s => (
              <button key={s} onClick={() => setBrushSize(s)}
                style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: brushSize === s ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.06)',
                  color: brushSize === s ? '#c9a96e' : 'rgba(255,255,255,0.5)',
                }}>
                {s === 2 ? 'S' : s === 4 ? 'M' : s === 8 ? 'L' : 'XL'}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Size</span>
            <input type="range" min={1} max={20} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: 80, accentColor: '#c9a96e' }}/>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 20 }}>{brushSize}</span>
          </div>
        )}

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Undo / Redo / Clear */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4 }}>
          <button onClick={undo} disabled={historyIndex <= 0} style={btn('ghost', historyIndex <= 0, btnH, fontSize)}>Undo</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} style={btn('ghost', historyIndex >= history.length - 1, btnH, fontSize)}>Redo</button>
          <button onClick={clearDrawing} style={btn('ghost', false, btnH, fontSize)}>Clear</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ background: '#f0f2f5', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16, overflowY: 'auto', touchAction: 'pan-y' }}>
        {loadingDrawing && (
          <div style={{ position: 'absolute', color: 'rgba(201,169,110,0.7)', fontSize: 13, pointerEvents: 'none' }}>Loading...</div>
        )}
        <canvas ref={canvasRef} style={{ borderRadius: 10, boxShadow: '0 4px 28px rgba(0,0,0,0.35)', touchAction: 'none', cursor: activeTool === 'select' ? 'default' : 'crosshair', display: 'block' }}/>
      </div>

      {/* Footer */}
      <div style={{ background: '#060e1c', padding: '7px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
          Anatomical references by{' '}
          <a href="https://smart.servier.com" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(201,169,110,0.45)', textDecoration: 'none' }}>
            Servier Medical Art
          </a>{' '}CC BY 4.0
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
          {encounterId.slice(0, 8)}...
        </span>
      </div>
    </div>
  )
}

// ── Style helper ──────────────────────────────────────────────────────────────────────────────────
function btn(variant: 'gold' | 'ghost', disabled: boolean, h = 36, fs = 12): React.CSSProperties {
  return {
    height: h, minWidth: h, paddingLeft: 12, paddingRight: 12,
    borderRadius: 8, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: fs, fontWeight: 600, opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.12s',
    background: variant === 'gold' ? '#c9a96e' : 'rgba(255,255,255,0.07)',
    color: variant === 'gold' ? '#060e1c' : 'rgba(255,255,255,0.65)',
  }
}
