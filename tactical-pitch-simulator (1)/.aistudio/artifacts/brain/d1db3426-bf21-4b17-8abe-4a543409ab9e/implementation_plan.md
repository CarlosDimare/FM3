# Simulador Tactico de Futbol 3D: Arquitectura Fisica, IA Colectiva y Analitica Opta/FM

Plan maestro integral para transformar el simulador de partido en una experiencia de realismo biomecanico, fisico, tactico y estadistico equivalente al motor de partidos de Football Manager y la telemetria avanzada de Opta. El diseno unifica fisica continua 3D en sub-pasos, animacion procedural articulada, IA colectiva basada en principios modernos de presion y transicion, fatiga realista en tiempo de juego y un centro analitico completo a nivel de equipo y jugador individual.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Estas cuatro decisiones estrategicas fueron confirmadas durante la fase de entrevista y rigen la totalidad del plan de implementacion:

- **Realismo Fisico y Biomecanico 3D Completo ("Las 3")**: Se implementaran simultaneamente colisiones corporales basadas en impulsos fisicos y saltos verticales, fisica real de contacto pie-balon/cuerpo-balon en entradas y disparos, e integracion directa entre la biomecanica 3D y las decisiones tacticas de la IA.
- **Prioridades de IA Colectiva y Logica de Juego**:
  - Transiciones defensa-ataque y ataque-defensa con traspresion coordinada (regla de los 5 segundos), trampas de presion hacia las bandas y sombras de cobertura sobre receptores interiores.
  - Duelos 1v1 realistas con orientacion corporal de perfil (*jockeying*), amagos/fintas segun atributos, entradas deslizantes con riesgo de falta y coberturas defensivas escalonadas.
  - Porteros sin paradas aleatorias: salidas de portero libero (*sweeper keeper*) sobre balones a la espalda, trayectorias de estirada por cinematica inversa (IK) + deteccion continua de colision mano-balon, blocajes vs despejes orientados y distribucion tactica diferenciada.
- **Analitica Grupal e Individual Completa (Estilo Football Manager y Opta)**: Registro evento-por-evento de xG, xGOT/PSxG, xA, PPDA, Inclinacion de Campo (*Field Tilt*), pases progresivos y clave, duelos terrestres/aereos, despejes, distancia recorrida, mapa de calor espacial, red de pases y tabla individual interactiva con inspector detallado por futbolista.
- **Ritmo de Partido y Evolucion Humana**: Ritmo de retransmision realista en tiempo efectivo con curva de fatiga acumulada que degrada gradualmente velocidad, agilidad de giro, primer toque y concentracion (provocando errores humanos creibles a partir del minuto 65-70).

---

## 1. Overview & Core Concept

- **Que Hace**: Simula un encuentro completo de futbol 11 contra 11 en un estadio 3D con fisica aerodinamica, colisiones corporales y aereas reales, inteligencia artificial colectiva guiada por ordenes tacticas en vivo y recoleccion de telemetria avanzada estilo Opta/FM sin microgestion administrativa externa al partido.
- **Audiencia Objetivo**: Entusiastas tacticos y jugadores veteranos de simuladores de futbol que exigen coherencia fisica (que ningun balon atraviese cuerpos ni un portero teletransporte atajadas), patrones colectivos reconocibles (presion alta, bloques bajos, carrileros doblando por fuera) y datos accionables para corregir el partido desde la banda.
- **Valor Diferencial**: Reemplaza las heuristicas probabilisticas opacas ("tirar un dado para ver si el portero para") por geometria fisica determinista en tiempo real combinada con atributos cognitivos y fisicos, logrando que cada gol, parada, duelo aereo o perdida bajo presion tenga una explicacion visual y estadistica verificable.

---

## 2. User Experience & Visual Design

- **Flujos Clave del Usuario**:
  1. **Preparacion Tactica Pre-Partido**: Seleccion de equipos, alineaciones, roles individuales, mentalidad e intensidad de presion con previsualizacion inmediata sobre el campo 3D limpio.
  2. **Observacion y Direccion en Tiempo Real**: El usuario alterna entre camaras (Transmision TV, Cenital Completa de todo el rectangulo de juego, Tactica Elevada, Seguir Balon) mientras el muelle inferior muestra el marcador en tiempo real, estados del portador, alertas de fatiga y ajustes tacticos al vuelo (linea defensiva, gatillos de presion, marcaje, sustituciones).
  3. **Inspeccion Analitica Profunda (Grupal e Individual)**: Al abrir la pestana de estadisticas o hacer clic sobre cualquier jugador en la lista o el campo, se despliega el centro Opta/FM con comparativa de equipo (PPDA, Field Tilt, xG vs xGOT), red de pases bilaterales, mapa de disparos por calidad post-tiro y tabla individual ordenable por rol/metrica con vista detallada por futbolista (mapa de calor propio, radar de rendimiento y registro de duelos).
  4. **Estados Vacios y de Carga**: Antes del pitido inicial o en los primeros segundos con cero eventos registrados, las redes de pases, mapas de tiro y mapas de calor muestran la silueta tactica reglamentaria con indicadores de estado claros (`Sin eventos registrados todavia`) sin saltos de diseno ni celdas rotas.

- **Identidad Visual y Sistema de Diseno**:
  - *Direccion Estetica*: Cabina de analisis tactico y retransmision nocturna de alta precision (*Broadcast Telemetry Dark*), sin adornos innecesarios ni distracciones sobre el cesped 3D.
  - *Paleta de Color y Atmosfera*: Dominante oscuro pizarra (`#090d12` / `#0b0f14`, 60%), superficies de panel elevadas sin desenfoque sobre el lienzo WebGL (`#111822` / `#161f2c`, 30%) y acentos semanticos calibrados para contraste inmediato de equipo local, visitante y alertas tacticas (`#38bdf8`, `#f59e0b`, `#10b981`, `#ef4444`, 10%).
  - *Tipografia y Jerarquia*: Sans geometrica nitida para encabezados y navegacion, acompanada obligatoriamente de cifras tabulares (`tabular-nums`) en reloj, xG, PPDA, porcentajes y tablas de rendimiento para evitar vibracion horizontal al actualizar cada segundo.
  - *Disciplina de Componentes y Espaciado*: Cero pildoras decorativas para metadatos estaticos (uso de separadores tipograficos `·`), cero bordes izquierdos gruesos de acento en tarjetas, separacion limpia mediante contraste de superficie y lineas finas de `1px`, y muelle tactico inferior compacto para maximizar la visibilidad del terreno de juego 3D.

- **Retroalimentacion Visual y Biomecanica 3D**:
  - Articulacion corporal visible en el campo: inclinacion del torso al acelerar, giro de cabeza al escanear opciones (`escaneando`), extension de brazos al proteger el balon, salto vertical real con flexion previa de rodillas en duelos aereos, deslizamiento completo en entradas rasas y estirada del portero alineada a la altura exacta del remate.
  - Micro-particulas ligeras pre-asignadas (cero creacion dinamica en bucle de render) para levantamiento sutil de cesped/polvo en disparos potentes, deslizamientos y botes fuertes, junto a anillos de foco discretos en el suelo para distinguir al portador, receptor proyectado y presion activa.
  - Iluminacion PBR calibrada con mapa de entorno neutro, espacio de color `sRGB`, sombras suaves de foco de estadio y camara cenital capaz de encuadrar el `105m x 68m` reglamentario sin recortar las lineas de banda o fondo.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Deteccion Continua de Colisiones (CCD) + Cinematica Inversa de Portero frente a Probabilidad Pura**
  - *Enfoque Elegido*: Barrido de segmento continuo (*Swept-Sphere CCD*) entre posicion previa y actual del balon en cada sub-paso fisico (`4` sub-pasos por frame de simulacion), combinado con una curva de desplazamiento de porteria impulsada por *Reflejos*, *Agilidad* y *Anticipacion* que posiciona guantes, antebrazos y torso en el espacio 3D real.
  - *Por Que*: A `35 m/s`, un disparo recorre casi `0.9 m` por paso discreto; sin CCD el balon atravesaria manos y piernas. Evaluar la interseccion geometrica mano-balon produce paradas por la punta de los dedos, rebotes hacia zonas laterales y goles por la escuadra fisicamente autenticos.
  - *Alternativas Descartadas*: Mantener tiradas de dado aleatorias (`Math.random() < saveChance`), ya que desvinculan la animacion 3D del resultado del disparo y generan frustracion visual.

- **Decision 2: Cuerpos Rigidos con Impulso, Centro de Gravedad y Eje Vertical `Y` en Jugadores**
  - *Enfoque Elegido*: Anadir altura vertical real (`y`, `vy`, fase de salto) y radio de capsula/hombro a los 22 futbolistas para resolver choques hombro-con-hombro (ponderados por *Fuerza*, *Equilibrio* y velocidad relativa), tropiezos tras choque fuerte y duelos aereos donde el jugador alcanza su apice segun *Salto* y *Cabecero* para redirigir el vector 3D del balon.
  - *Por Que*: Permite juego fisico real sin bloqueos artificiales, separa disputas aereas limpias de faltas por carga ilegal y da peso corporal visible al proteger la posesion.
  - *Alternativas Descartadas*: Fuerzas blandas de repulsión en 2D plano, que hacen que los jugadores "floten" alrededor unos de otros sin transmitir choque ni disputar balones por alto.

- **Decision 3: Libro de Eventos Opta/FM Pre-asignado y Matrices Espaciales Ligero-Memoria**
  - *Enfoque Elegido*: Registrar cada accion canonica en un flujo estructurado de eventos y acumular mapas de calor individuales/grupales en una rejilla pre-asignada de `12 x 8` celdas por equipo y jugador directamente dentro del motor, renderizando visualizaciones vectoriales SVG nativas y tablas ordenables de alta densidad.
  - *Por Que*: Evita sobrecarga de recoleccion de basura en WebGL/React durante 90 minutos simulados y ofrece instantaneidad total al cambiar de pestana o inspeccionar un jugador sin librerias pesadas externas.
  - *Alternativas Descartadas*: Almacenar miles de coordenadas crudas por jugador y recalcular densidad por fotograma, lo cual degradaria la fluidez a velocidades `2x`/`4x`.

- **Decision 4: Curva de Fatiga Acumulada No Lineal con Errores Humanos**
  - *Enfoque Elegido*: Desgaste diferenciado por intensidad de esfuerzo (*sprint*, presion alta, saltos) frente a recuperacion en trote/caminata; por debajo de `60%` de energia se aplica penalizacion progresiva a aceleracion, agilidad de giro, control orientado (*Primer Toque*) y *Concentracion* (mayor probabilidad de mal control, linea de fuera de juego retrasada o entrada a destiempo).
  - *Por Que*: Hace indispensables las sustituciones tacticas en la segunda mitad, explica las remontadas tardias y elimina la sensacion robotica de futbolistas incansables al minuto 88.
  - *Alternativas Descartadas*: Reduccion lineal uniforme de velocidad maxima o partidos sin degradacion cognitiva.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Arquitectura del Sistema y Flujo de Datos

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    MOTOR DE SIMULACION (Sub-pasos 4x)                     │
│                                                                           │
│  ┌──────────────────────┐    ┌──────────────────────┐    ┌─────────────┐  │
│  │ Fisica Balon & CCD   │◄──►│ Biomecanica Jugador  │◄──►│ IA Colectiva│  │
│  │ • Drag + Magnus 3D   │    │ • Capsulas + Impulso │    │ • Trampas   │  │
│  │ • Rebote superficie  │    │ • Salto Y + Cabecero │    │ • Cobertura │  │
│  │ • Barrido Swept CCD  │    │ • Entrada / Tropiezo │    │ • Portero IK│  │
│  └──────────┬───────────┘    └──────────┬───────────┘    └──────┬──────┘  │
│             └───────────────────────────┼───────────────────────┘         │
│                                         ▼                                 │
│                 ┌───────────────────────────────────────────────┐         │
│                 │   Libro Canonico de Eventos y Telemetria      │         │
│                 │   • xG / xGOT (PSxG) / xA / PPDA / Field Tilt │         │
│                 │   • Rejilla Heatmap 12x8 + Matriz de Pases    │         │
│                 │   • Calificacion Dinamica FM (6.0 - 10.0)     │         │
│                 └───────────────────────┬───────────────────────┘         │
└─────────────────────────────────────────┼─────────────────────────────────┘
                                          │ Snapshot sincronizado por frame
        ┌─────────────────────────────────┴─────────────────────────────────┐
        ▼                                                                   ▼
┌─────────────────────────────────────────┐ ┌───────────────────────────────┐
│     RENDERIZADOR BIOMECANICO 3D         │ │   CABINA DE MANDO Y OPTA/FM   │
│     (Three.js WebGL · 0-GC Loop)        │ │   (React UI · Tabular Data)   │
│                                         │ │                               │
│ • Rigs articulados (cuello/rodillas/IK) │ │ • Marcador + Muelle Tactico   │
│ • Inclinacion por inercia y estiradas   │ │ • Analitica Grupal Opta/FM    │
│ • Particulas cesped y anillos de rol    │ │ • Red Pases + Mapa xGOT       │
│ • Camara TV / Cenital 105x68 / Tactica  │ │ • Box-Score + Inspector Jug.  │
└─────────────────────────────────────────┘ └───────────────────────────────┘
```

### Modelo Fisico, Biomecanico e IA Detallado

1. **Fisica Continua del Balon y Contacto (Sub-pasos de `dt / 4`)**:
   - **Aerodinamica 3D**: Arrastre cuadratico dependiente de densidad del aire y seccion transversal, mas fuerza de Magnus ($\vec{\omega} \times \vec{v}$) para disparos con rosca, centros bombeados y cambios de orientacion que caen rapido (*topspin*) o abren hacia la escuadra.
   - **Rebotes por Zona de Impacto**: Coeficientes diferenciados para cesped humedo (menor friccion en deslizamiento, perdida moderada en eje vertical), postes metalicos cilindricos (reflexion elastica con `restitution ≈ 0.78` + giro inducido), red elastica amortiguadora y contacto corporal (empeine, interior, muslo, pecho, frente).
   - **Swept-Sphere CCD**: En cada sub-paso se calcula la distancia minima segmento-a-capsula/esfera contra extremidades de defensores y manos/torso del portero para evitar que remates potentes atraviesen objetivos.

2. **Cinematica Corporal y Duelos Fisicos de los 22 Jugadores**:
   - **Estado Vertical y Pose**: Cada jugador incorpora posicion vertical `y`, velocidad `vy`, temporizador de entrada deslizante, temporizador de tropiezo/recuperacion, angulo de giro cervical (*headYaw* al escanear), flexion de rodillas y angulo de estirada.
   - **Colisiones Hombro-a-Hombro y Desequilibrio**: Cuando dos capsulas invaden el radio combinado (`~0.76 m`), se calcula un impulso normal proporcional a la diferencia de masa efectiva (`Fuerza * Equilibrio`). Si el choque supera el umbral de estabilidad del jugador cansado o mal perfilado, entra brevemente en estado de tropiezo recuperando postura sin perder coherencia visual.
   - **Duelos Aereos Reales**: Ante balones por encima de `1.15 m`, los candidatos calculan tiempo de intercepcion, inician carrera de batida y ejecutan salto parabolico hacia un apice determinado por su atributo *Salto*. En el contacto aereo, el vencedor (combinacion de altura alcanzada, posicionamiento y *Cabecero*/*Fuerza*) imprime vector de salida limpio hacia un companero, despeje lateral o remate picado a puerta.
   - **Entradas Rasas y Limpias vs Faltas**: Un defensor en persecucion lateral o frontal puede lanzar una entrada deslizante orientada por *Entradas* y *Anticipacion*; el exito depende de si la bota intersecta la esfera del balon antes que las piernas del portador, generando un despeje tangencial o sancion arbitral realista (falta/tarjeta segun angulo por detras y fuerza).

3. **Portero por Cinematica Inversa (IK) y Portero Libero**:
   - **Lectura del Remate y Envelope de Alcance**: Tras un disparo, el portero evalua el punto proyectado en el plano de gol tras un tiempo de reaccion fisiologico (`~140-260 ms` inverso a *Reflejos* y *Concentracion*). Inicia desplazamiento lateral o salto en estirada orientando su brazo hacia el cuadrante del remate.
   - **Resolucion por Interseccion Real**:
     - *Blocaje limpio*: Si la velocidad relativa mano-balon cae dentro del umbral de *Agarre* y el angulo es frontal.
     - *Desvio / Rechace*: En tiros a la escuadra o rasos al limite de envergadura, los guantes desvian el vector de velocidad segun la normal de contacto (generando saques de esquina o segundas jugadas en el area chica).
   - **Salidas de Portero Libero y Distribucion**: En balones filtrados a la espalda de una defensa adelantada, el portero compara su tiempo de llegada al punto de cruce contra el delantero para salir al despeje o achique angular. Tras recuperar, elige distribucion tactica segun presion rival (saque raso al central abierto, envio tenso al lateral o golpeo largo al hombre objetivo).

4. **Inteligencia Artificial Colectiva y Fatiga Humana**:
   - **Transicion Defensa <-> Ataque**:
     - *Trasperdida (5 segundos)*: Si la instruccion tactica indica contrapresion, los 3 jugadores mas cercanos cierran en abanico mientras la linea trasera acorta metros para mantener compacidad vertical (`<= 35 m`).
     - *Transicion Ofensiva*: Al recuperar, el portador dispone de opciones diferenciadas (conducir hacia espacio libre con toques progresivos, girar y pausar en zona de creacion, o lanzar ruptura diagonal al extremo/punta).
   - **Trampas de Presion y Sombras de Cobertura**: El acosador principal orienta su carrera en arco (*curved press*) para negar el pase interior (cono de sombra sobre el pivote), obligando a la salida hacia la banda donde espera el salto coordinado de lateral y extremo.
   - **Duelos 1v1 y Perfilamiento Defensivo**: El defensor aplica *jockeying* manteniendo distancia de seguridad (`1.4 - 2.2 m`) entre balon y porteria propia, evitando lanzarse al primer amago segun su *Concentracion* y *Anticipacion*.
   - **Fatiga y Errores Humanos**: Cada accion explosiva drena energia; por debajo del `60%`, los tiempos de reaccion suben, el radio de dispersion en primer toque y pase aumenta, y aparecen micro-errores realistas (control largo que habilita presion rival, centro pasado o salto tardio al fuera de juego).

5. **Motor Estadistico Completo Opta / Football Manager**:
   - **Metricas Grupales**: Posesion real y por tercios, `xG` acumulado, `xGOT / PSxG` (calidad post-disparo segun colocacion en porteria y velocidad), `PPDA` (pases rivales en los dos primeros tercios divididos por entradas + intercepciones + faltas defensivas), *Field Tilt %* (cuota de pases en el ultimo tercio), Pases Progresivos, Pases al Area, Ocasiones Clave, Duelos Terrestres/Aereos Ganados %, Despejes, Tiros Bloqueados, Canales de Ataque (Izquierda / Centro / Derecha %) y Zonas de Accion.
   - **Metricas Individuales por Futbolista**: Minutos, Calificacion Dinamica FM (`6.0 - 10.0`), Goles, Asistencias, `xG`, `xA`, `xGOT`, Tiros (a puerta / fuera / bloqueados), Pases Intentados/Completados y %, Pases Clave, Pases Progresivos, Conducciones Progresivas, Regates Intentados/Exitosos, Duelos Terrestres (G/P), Duelos Aereos (G/P), Entradas, Intercepciones, Despejes, Tiros Bloqueados, Faltas Cometidas/Recibidas, Distancia Recorrida (`km`), Sprints, Paradas y *Goles Evitados de Portero* (`xGOT recibido - Goles encajados`), mas rejilla espacial `12 x 8` de intervenciones para mapa de calor propio.

### Mapeo Interactivo de Componentes y Estados

- **Barra Superior de Marcador y Muelle Tactico Inferior**: Muestran minuto real, marcador, `xG`, estado instantaneo del portador (`Controlando`, `Conduciendo`, `Escaneando`, `Armando tiro`) y accesos directos de camara (incluyendo vista cenital completa `105x68`), velocidad (`1x`, `2x`, `4x`), presion, altura de linea y cambios.
- **Pestana Analitica Grupal Opta/FM**:
  - *Resumen Comparativo*: Barras simetricas de alto contraste con cifras tabulares (`xG`, `xGOT`, `PPDA`, `Field Tilt`, duelos, pases progresivos, ataques por carril).
  - *Mapa Tactico Dual de Tiros y xGOT*: Puntos escalados por `xG`, diferenciados por resultado (gol, parada, poste, fuera) y filtro por equipo o mitad.
  - *Red de Pases Bilaterales*: Posiciones medias reales de los 11 titulares con grosor de conexion proporcional al volumen de pases entre pares y tamano de nodo por intervenciones.
- **Pestana de Rendimiento Individual y Box-Score**:
  - *Tabla Ordenable por Categorias*: Filtros de grupo (`General`, `Ataque`, `Distribucion`, `Defensa y Duelos`, `Fisico y Porteria`), filtro por equipo (`Local` / `Visitante` / `Ambos`) y ordenacion descendente/ascendente por cualquier columna.
  - *Inspector Lateral / Modal de Jugador*: Al seleccionar cualquier jugador (desde la tabla o haciendo clic directo sobre su dorsal en el campo 3D), se abre su ficha tecnica con barra de fatiga actual, calificacion FM desglosada, mapa de calor individual `12 x 8` sobre silueta de campo y comparativa de sus duelos y pases progresivos.
