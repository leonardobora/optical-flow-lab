const config = {
  roundSeconds: 60,
  totalRounds: 5,
  changesPerRound: 2,
  startMoney: 1200,
  sellTruckCredit: 160,
  moveCost: 45,
  analystCost: 110,
  marketerCost: 130,
  orderReward: 175,
  latePenalty: 35,
  scrapPenalty: 25,
  batchSize: 5,
  tickScale: 0.35
};

const stationBlueprints = [
  { id: "planning", name: "Demanda", role: "Entrada dos pedidos de bobinas opticas.", cycle: 2.0, fail: 0.01 },
  { id: "draw", name: "Trefilacao", role: "Forma a fibra e concentra setup.", cycle: 5.2, fail: 0.07 },
  { id: "coat", name: "Revestimento", role: "Protege a fibra no cabo.", cycle: 3.5, fail: 0.04 },
  { id: "color", name: "Coloracao", role: "Identifica e prepara a bobina.", cycle: 4.2, fail: 0.06 },
  { id: "test", name: "Teste optico", role: "Mede perda e estabilidade.", cycle: 3.1, fail: 0.02 },
  { id: "shipping", name: "Expedicao", role: "Entrega bobinas aprovadas.", cycle: 2.0, fail: 0 }
];

const wasteDefinitions = {
  overproduction: {
    label: "Superproducao",
    short: "Pedidos e WIP acima da capacidade real da linha.",
    tip: "Produzir ou liberar pedidos antes da necessidade cria filas e capital parado."
  },
  waiting: {
    label: "Espera",
    short: "Tempo parado por falta de material, fila ou bloqueio.",
    tip: "Espera aparece quando uma etapa fica sem entrada ou quando a saida nao flui."
  },
  transport: {
    label: "Transporte",
    short: "Trechos que ainda dependem do AGV por lote.",
    tip: "Transporte nao agrega valor ao cabo; fluxo unitario reduz esse desperdicio."
  },
  overprocessing: {
    label: "Processamento extra",
    short: "Setup, ajustes e retrabalho na Trefilacao.",
    tip: "SMED e padronizacao reduzem ajustes que nao agregam valor ao produto."
  },
  inventory: {
    label: "Inventario",
    short: "WIP acumulado em entradas e saidas.",
    tip: "Estoque em processo esconde problemas e aumenta lead time."
  },
  motion: {
    label: "Movimentacao",
    short: "Manuseio interno causado por layout disperso.",
    tip: "Movimentacao e esforco sem transformacao do produto."
  },
  defects: {
    label: "Defeitos",
    short: "Bobinas que falham no teste optico.",
    tip: "Defeito gera perda, retrabalho e atraso; qualidade na fonte reduz o desperdicio."
  }
};

const stations = stationBlueprints.map((station) => ({
  ...station,
  input: [],
  output: [],
  processing: null,
  progress: 0,
  idle: 0,
  blocked: 0
}));

let state;
let timerId;
let lastFrame = performance.now();

const el = {
  factory: document.querySelector("#factory"),
  money: document.querySelector("#money"),
  delivered: document.querySelector("#delivered"),
  flowScore: document.querySelector("#flowScore"),
  round: document.querySelector("#round"),
  changes: document.querySelector("#changes"),
  clock: document.querySelector("#clock"),
  phaseLabel: document.querySelector("#phaseLabel"),
  statusDot: document.querySelector("#statusDot"),
  selectedName: document.querySelector("#selectedName"),
  selectedText: document.querySelector("#selectedText"),
  layoutMode: document.querySelector("#layoutMode"),
  truckState: document.querySelector("#truckState"),
  batchSize: document.querySelector("#batchSize"),
  ordersMeter: document.querySelector("#ordersMeter"),
  ordersText: document.querySelector("#ordersText"),
  wipMeter: document.querySelector("#wipMeter"),
  wipText: document.querySelector("#wipText"),
  leadMeter: document.querySelector("#leadMeter"),
  leadText: document.querySelector("#leadText"),
  scrapMeter: document.querySelector("#scrapMeter"),
  scrapText: document.querySelector("#scrapText"),
  wasteList: document.querySelector("#wasteList"),
  diagnostic: document.querySelector("#diagnostic"),
  log: document.querySelector("#log"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  compactBtn: document.querySelector("#compactBtn"),
  analystBtn: document.querySelector("#analystBtn"),
  marketerBtn: document.querySelector("#marketerBtn"),
  sellTruckBtn: document.querySelector("#sellTruckBtn")
};

function freshState() {
  stations.forEach((station) => {
    station.input = [];
    station.output = [];
    station.processing = null;
    station.progress = 0;
    station.idle = 0;
    station.blocked = 0;
  });

  return {
    running: false,
    round: 1,
    timeLeft: config.roundSeconds,
    changes: config.changesPerRound,
    money: config.startMoney,
    delivered: 0,
    scrap: 0,
    expired: 0,
    nextOrderId: 1,
    orderTimer: 2,
    orderPace: 6.2,
    selected: "planning",
    connectedUntil: 0,
    analyst: false,
    marketer: false,
    truckSold: false,
    truckBusy: false,
    truckFrom: 0,
    truckTo: 0,
    truckProgress: 0,
    leadTimes: [],
    wasteLogTimer: 0,
    lastDominantWaste: "",
    events: ["Tutorial: reduza Muda sem perder entrega."]
  };
}

function stationById(id) {
  return stations.find((station) => station.id === id);
}

function nextStation(index) {
  return stations[index + 1];
}

function isConnected(index) {
  return index < state.connectedUntil;
}

function canSpend(cost = 0) {
  return state.changes > 0 && state.money >= cost && !state.running;
}

function spend(cost) {
  state.money -= cost;
  state.changes -= 1;
}

function logEvent(text) {
  state.events.unshift(text);
  state.events = state.events.slice(0, 8);
}

function createOrder() {
  const types = ["drop", "backbone", "datacenter"];
  const type = types[Math.floor(Math.random() * types.length)];
  stations[0].input.push({
    id: state.nextOrderId++,
    type,
    age: 0,
    due: state.marketer ? 42 : 58,
    damaged: false
  });
}

function updateOrders(dt) {
  state.orderTimer -= dt;
  if (state.orderTimer <= 0) {
    createOrder();
    state.orderTimer = state.orderPace * (state.marketer ? 0.64 : 1);
  }

  allOrders().forEach((order) => {
    order.age += dt;
    if (order.age > order.due && !order.lateCounted) {
      order.lateCounted = true;
      state.expired += 1;
      state.money -= config.latePenalty;
      logEvent(`Espera: pedido #${order.id} perdeu o prazo de entrega.`);
    }
  });
}

function allOrders() {
  const orders = [];
  stations.forEach((station) => {
    orders.push(...station.input, ...station.output);
    if (station.processing) orders.push(station.processing);
  });
  return orders;
}

function processStations(dt) {
  stations.forEach((station, index) => {
    if (!station.processing && station.input.length > 0) {
      station.processing = chooseNextOrder(station);
      station.progress = 0;
    }

    if (!station.processing) {
      station.idle += dt;
      return;
    }

    const outputLimit = isConnected(index) ? 99 : 10;
    if (station.output.length >= outputLimit) {
      station.blocked += dt;
      return;
    }

    const engineerFactor = state.analyst && station.id === "draw" ? 0.64 : 1;
    station.progress += dt / (station.cycle * engineerFactor);

    if (station.progress >= 1) {
      const order = station.processing;
      station.processing = null;
      station.progress = 0;

      if (Math.random() < station.fail && !state.analyst) {
        order.damaged = true;
      }

      if (station.id === "shipping") {
        completeOrder(order);
      } else {
        station.output.push(order);
      }
    }
  });
}

function chooseNextOrder(station) {
  if (!(state.analyst && station.id === "draw")) {
    return station.input.shift();
  }

  const currentType = station.output.at(-1)?.type;
  const sameTypeIndex = station.input.findIndex((order) => order.type === currentType);
  const index = sameTypeIndex >= 0 ? sameTypeIndex : 0;
  return station.input.splice(index, 1)[0];
}

function completeOrder(order) {
  state.leadTimes.push(order.age);
  state.leadTimes = state.leadTimes.slice(-20);

  if (order.damaged) {
    state.scrap += 1;
    state.money -= config.scrapPenalty;
    logEvent(`Defeitos: bobina #${order.id} falhou no teste optico.`);
    return;
  }

  state.delivered += 1;
  const bonus = order.lateCounted ? 0.55 : 1;
  const wasteBonus = Math.max(0, 18 - getDominantWaste(calculateWasteMetrics()).value);
  state.money += Math.round(config.orderReward * bonus + wasteBonus);
}

function moveMaterial() {
  for (let index = 0; index < stations.length - 1; index += 1) {
    const from = stations[index];
    const to = nextStation(index);
    if (isConnected(index)) {
      while (from.output.length > 0 && to.input.length < 14) {
        to.input.push(from.output.shift());
      }
    }
  }

  if (state.truckSold || state.truckBusy) return;

  const sourceIndex = stations.findIndex((station, index) => {
    const target = nextStation(index);
    return target && !isConnected(index) && station.output.length >= config.batchSize && target.input.length <= 9;
  });

  if (sourceIndex >= 0) {
    state.truckBusy = true;
    state.truckFrom = sourceIndex;
    state.truckTo = sourceIndex + 1;
    state.truckProgress = 0;
  }
}

function updateTruck(dt) {
  if (!state.truckBusy) return;

  state.truckProgress += dt / 3.2;
  if (state.truckProgress >= 1) {
    const from = stations[state.truckFrom];
    const to = stations[state.truckTo];
    const load = from.output.splice(0, config.batchSize);
    to.input.push(...load);
    state.truckBusy = false;
    state.truckProgress = 0;
  }
}

function endRound() {
  state.running = false;
  state.money -= 95;

  if (state.round >= config.totalRounds) {
    el.phaseLabel.textContent = "Simulacao encerrada";
    logEvent(`Fim do jogo. Capital final: $${Math.max(0, Math.round(state.money))}.`);
    render();
    return;
  }

  state.round += 1;
  state.timeLeft = config.roundSeconds;
  state.changes = config.changesPerRound;
  logEvent(`Rodada ${state.round} pronta. Faca ate duas decisoes.`);
}

function tick(now) {
  const rawDt = Math.min(0.08, (now - lastFrame) / 1000);
  lastFrame = now;
  const dt = rawDt / config.tickScale;

  if (state.running) {
    state.timeLeft -= dt;
    state.wasteLogTimer += dt;
    updateOrders(dt);
    processStations(dt);
    moveMaterial();
    updateTruck(dt);
    maybeLogWaste();
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endRound();
    }
  }

  render();
  timerId = requestAnimationFrame(tick);
}

function calculateWasteMetrics() {
  const orders = allOrders();
  const wip = stations.reduce((total, station) => total + station.input.length + station.output.length + (station.processing ? 1 : 0), 0);
  const avgLead = state.leadTimes.length ? state.leadTimes.reduce((sum, item) => sum + item, 0) / state.leadTimes.length : 0;
  const disconnected = stations.length - 1 - state.connectedUntil;
  const blocked = stations.reduce((sum, station) => sum + station.blocked, 0);
  const idle = stations.reduce((sum, station) => sum + station.idle, 0);
  const drawWip = stations[1].input.length + stations[1].output.length + (stations[1].processing ? 1 : 0);
  const oldestOrder = orders.reduce((max, order) => Math.max(max, order.age / order.due), 0);

  return {
    overproduction: clampWaste((Math.max(0, orders.length - 8) * 8) + (state.marketer && state.connectedUntil < 3 ? 22 : 0)),
    waiting: clampWaste((oldestOrder * 42) + (blocked / 18) + (idle / 70) + (state.truckSold && disconnected > 0 ? 28 : 0)),
    transport: clampWaste(disconnected * 17 + (state.truckBusy ? 10 : 0) - (state.truckSold && disconnected === 0 ? 20 : 0)),
    overprocessing: clampWaste(drawWip * 7 + (!state.analyst ? 28 : 5)),
    inventory: clampWaste(wip * 4 + Math.max(0, avgLead - 25)),
    motion: clampWaste(disconnected * 14 + (state.truckSold && disconnected > 0 ? 18 : 0)),
    defects: clampWaste(state.scrap * 18 + (!state.analyst ? 12 : 2))
  };
}

function clampWaste(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getDominantWaste(metrics) {
  return Object.entries(metrics).reduce((worst, [key, value]) => {
    if (!worst || value > worst.value) {
      return { key, value, ...wasteDefinitions[key] };
    }
    return worst;
  }, null);
}

function maybeLogWaste() {
  if (state.wasteLogTimer < 10) return;
  state.wasteLogTimer = 0;
  const dominant = getDominantWaste(calculateWasteMetrics());
  if (!dominant || dominant.value < 45 || dominant.key === state.lastDominantWaste) return;

  state.lastDominantWaste = dominant.key;
  const messages = {
    overproduction: "Superproducao: demanda liberada acima da capacidade atual.",
    waiting: "Espera: fluxo parado por fila, bloqueio ou falta de conexao.",
    transport: "Transporte: trechos ainda dependem do AGV por lote.",
    overprocessing: "Processamento extra: Trefilacao precisa de SMED e padronizacao.",
    inventory: "Inventario: WIP alto esta aumentando o lead time.",
    motion: "Movimentacao: layout disperso ainda exige manuseio interno.",
    defects: "Defeitos: falhas no teste optico estao consumindo margem."
  };
  logEvent(messages[dominant.key]);
}

function renderFactory() {
  const scrollParent = el.factory.parentElement;
  const previousScroll = scrollParent ? scrollParent.scrollLeft : 0;
  el.factory.innerHTML = "";

  stations.forEach((station, index) => {
    const step = index + 1;
    const card = document.createElement("button");
    card.className = `station ${station.id === state.selected ? "selected" : ""} ${index <= state.connectedUntil && index > 0 ? "connected-card" : ""}`;
    card.type = "button";
    card.dataset.id = station.id;
    card.innerHTML = `
      <div class="station-head">
        <span class="step-no">${step}</span>
        <div>
          <h3>${station.name}</h3>
          <small>${station.role}</small>
        </div>
      </div>
      <div class="station-data">
        <span title="Entrada">${station.input.length}</span>
        <span title="Processo">${station.processing ? "1" : "0"}</span>
        <span title="Saida">${station.output.length}</span>
      </div>
      <div class="station-labels">
        <span>Entrada</span>
        <span>Proc.</span>
        <span>Saida</span>
      </div>
      <div class="progress"><i style="width:${Math.round(station.progress * 100)}%"></i></div>
      ${station.processing ? '<i class="work-piece" aria-hidden="true"></i>' : ""}
    `;
    card.addEventListener("click", () => {
      state.selected = station.id;
      render();
    });
    el.factory.appendChild(card);

    if (index < stations.length - 1) {
      el.factory.appendChild(createConnector(index));
    }
  });

  if (scrollParent) {
    scrollParent.scrollLeft = previousScroll;
  }
}

function createConnector(index) {
  const connected = isConnected(index);
  const connector = document.createElement("div");
  connector.className = `flow-connector ${connected ? "connected-route" : "batch-route"} ${state.truckBusy && state.truckFrom === index ? "active-agv" : ""}`;
  connector.innerHTML = `
    <span class="flow-line"></span>
    <strong>${connected ? "1x1" : `Lote ${config.batchSize}`}</strong>
    <small>${connected ? "Fluxo unitario" : "AGV"}</small>
  `;
  return connector;
}

function renderWaste(metrics) {
  const dominant = getDominantWaste(metrics);
  el.wasteList.innerHTML = Object.entries(wasteDefinitions).map(([key, definition]) => {
    const value = metrics[key];
    const level = value >= 70 ? "critical" : value >= 40 ? "warning" : "healthy";
    const active = dominant.key === key ? "dominant" : "";
    return `
      <article class="waste-item ${level} ${active} tip" data-tip="${definition.tip}">
        <div>
          <span>${definition.label}</span>
          <strong>${value}%</strong>
        </div>
        <meter min="0" max="100" value="${value}"></meter>
        <p>${definition.short}</p>
      </article>
    `;
  }).join("");
}

function render() {
  const selected = stationById(state.selected);
  const orders = allOrders();
  const wip = stations.reduce((total, station) => total + station.input.length + station.output.length + (station.processing ? 1 : 0), 0);
  const avgLead = state.leadTimes.length ? state.leadTimes.reduce((sum, item) => sum + item, 0) / state.leadTimes.length : 0;
  const metrics = calculateWasteMetrics();
  const dominant = getDominantWaste(metrics);
  const wasteAverage = Object.values(metrics).reduce((sum, value) => sum + value, 0) / Object.values(metrics).length;
  const flowScore = Math.max(0, Math.min(99, Math.round(100 - wasteAverage)));

  el.money.textContent = `$${Math.max(0, Math.round(state.money))}`;
  el.delivered.textContent = state.delivered;
  el.flowScore.textContent = `${flowScore}%`;
  el.round.textContent = `${state.round}/${config.totalRounds}`;
  el.changes.textContent = state.changes;
  el.clock.textContent = formatTime(state.timeLeft);
  el.phaseLabel.textContent = state.running ? "Linha em producao" : state.round >= config.totalRounds && state.timeLeft === 0 ? "Simulacao encerrada" : "Preparar linha optica";
  el.statusDot.classList.toggle("running", state.running);
  el.selectedName.textContent = selected.name;
  el.selectedText.textContent = selected.role;
  el.layoutMode.textContent = state.connectedUntil >= stations.length - 1 ? "Celula completa" : state.connectedUntil > 0 ? "Celula parcial" : "Layout disperso";
  el.truckState.textContent = state.truckSold ? "Desativado" : state.truckBusy ? "Em rota" : "Disponivel";
  el.batchSize.textContent = state.connectedUntil >= stations.length - 1 ? "1 bobina" : `${config.batchSize} bobinas`;
  el.ordersMeter.value = orders.length;
  el.ordersText.textContent = orders.length;
  el.wipMeter.value = wip;
  el.wipText.textContent = wip;
  el.leadMeter.value = avgLead;
  el.leadText.textContent = `${Math.round(avgLead)}s`;
  el.scrapMeter.value = state.scrap;
  el.scrapText.textContent = state.scrap;
  el.diagnostic.textContent = diagnostic(dominant);
  el.log.innerHTML = state.events.map((event) => `<li>${event}</li>`).join("");

  el.startBtn.disabled = state.running || (state.round >= config.totalRounds && state.timeLeft === 0);
  el.pauseBtn.disabled = !state.running;
  el.compactBtn.disabled = !canSpend(config.moveCost) || state.connectedUntil >= stations.length - 1;
  el.analystBtn.disabled = !canSpend(config.analystCost) || state.analyst;
  el.marketerBtn.disabled = !canSpend(config.marketerCost) || state.marketer;
  el.sellTruckBtn.disabled = !canSpend(0) || state.truckSold;

  renderFactory();
  renderWaste(metrics);
}

function diagnostic(dominant) {
  if (state.truckSold && state.connectedUntil < stations.length - 1) {
    return "Muda dominante: Espera. O AGV foi desativado antes da celula completa; compacte as conexoes restantes.";
  }

  const actions = {
    overproduction: "Segure Marketing ate a linha absorver a demanda; compacte conexoes para aumentar capacidade real.",
    waiting: "Compacte o proximo trecho para reduzir fila, bloqueio e tempo parado.",
    transport: "Compacte conexoes para trocar lote por fluxo unitario e reduzir dependencia do AGV.",
    overprocessing: "Use Engenheira Lean para aplicar SMED na Trefilacao e reduzir ajustes.",
    inventory: "Reduza WIP conectando etapas e evitando liberar demanda antes do fluxo estar pronto.",
    motion: "Aproxime as etapas com Compactar conexao para diminuir manuseio interno.",
    defects: "Use Engenheira Lean para estabilizar processo e reduzir falhas no teste optico."
  };

  if (state.connectedUntil >= stations.length - 1 && !state.marketer) {
    return "Muda sob controle: fluxo unitario ativo. Agora Marketing tende a gerar receita sem colapsar filas.";
  }

  return `Muda dominante: ${dominant.label}. ${actions[dominant.key]}`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function compactNextConnection() {
  if (!canSpend(config.moveCost) || state.connectedUntil >= stations.length - 1) return;
  spend(config.moveCost);
  state.connectedUntil += 1;

  const from = stations[state.connectedUntil - 1].name;
  const to = stations[state.connectedUntil].name;
  logEvent(`Transporte: ${from} conectado a ${to}; lote virou fluxo unitario.`);
  render();
}

function assignAnalyst() {
  if (!canSpend(config.analystCost) || state.analyst) return;
  spend(config.analystCost);
  state.analyst = true;
  logEvent("Processamento extra: Engenheira Lean reduziu setup da Trefilacao.");
  render();
}

function activateMarketing() {
  if (!canSpend(config.marketerCost) || state.marketer) return;
  spend(config.marketerCost);
  state.marketer = true;
  state.orderPace = 4.6;
  logEvent("Superproducao: Marketing aumentou pedidos; monitore WIP e espera.");
  render();
}

function sellTruck() {
  if (!canSpend(0) || state.truckSold) return;
  spend(0);
  state.truckSold = true;
  state.money += config.sellTruckCredit;
  logEvent("Transporte: AGV desativado; seguro apenas com celula quase completa.");
  render();
}

function bindEvents() {
  el.startBtn.addEventListener("click", () => {
    state.running = true;
    lastFrame = performance.now();
    logEvent(`Rodada ${state.round} iniciada.`);
    render();
  });

  el.pauseBtn.addEventListener("click", () => {
    state.running = false;
    logEvent("Simulacao pausada para decisao.");
    render();
  });

  el.resetBtn.addEventListener("click", () => {
    state = freshState();
    logEvent("Linha optica reiniciada.");
    render();
  });

  el.compactBtn.addEventListener("click", compactNextConnection);
  el.analystBtn.addEventListener("click", assignAnalyst);
  el.marketerBtn.addEventListener("click", activateMarketing);
  el.sellTruckBtn.addEventListener("click", sellTruck);
  window.addEventListener("resize", render);
}

state = freshState();
bindEvents();
render();
timerId = requestAnimationFrame(tick);
