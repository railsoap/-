
import React, { useState, useEffect } from 'react';
import { FieldConfig, GameParams, CropColor, LogicPlot, PlotConfig } from './types';
import { solve, clearMemo, SolveResult } from './services/logic';
import { IconSprout, IconSettings, IconX, IconRefresh } from './components/Icons';

// --- Default Configuration ---
const DEFAULT_PARAMS: GameParams = {
  buyCountPurple: 10000,
  buyCountBlue: 8000,
  buyCountYellow: 5500,
  probSurvival: 0.1,
  valL1: 0,
  valL2: 10,
  valL3: 400,
  valL4: 800,
  probL1toL2: 0.25,
  probL2toL3: 0.18,
  probL3toL4: 0.1,
};

// --- Storage Keys ---
const STORAGE_KEYS = {
  PARAMS: 'crop_calc_params',
  FIELD_COUNT: 'crop_calc_field_count',
  FIELDS: 'crop_calc_fields',
  NEIGHBOR_CHECK: 'crop_calc_neighbor_check'
};

// --- Initial Fields ---
const generateFields = (count: number): FieldConfig[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `field${i + 1}`,
    left: { id: `field${i + 1}-L`, color: 'purple', active: true, k: 0 },
    right: { id: `field${i + 1}-R`, color: 'blue', active: true, k: 0 }
  }));
};

export default function App() {
  // --- State with Persistence ---
  
  const [activeTab, setActiveTab] = useState<'strategy' | 'settings'>('strategy');
  
  // Load Params
  const [params, setParams] = useState<GameParams>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PARAMS);
      return saved ? { ...DEFAULT_PARAMS, ...JSON.parse(saved) } : DEFAULT_PARAMS;
    } catch { return DEFAULT_PARAMS; }
  });
  
  // Load Field Count
  const [fieldCount, setFieldCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FIELD_COUNT);
      return saved ? parseInt(saved, 10) : 3;
    } catch { return 3; }
  });

  // Load Fields
  const [fields, setFields] = useState<FieldConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FIELDS);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    
    // Fallback if no fields saved: generate based on saved count or default 3
    let count = 3;
    try {
      const savedCount = localStorage.getItem(STORAGE_KEYS.FIELD_COUNT);
      if (savedCount) count = parseInt(savedCount, 10);
    } catch {}
    return generateFields(count);
  });
  
  // Logic & Suggestion State
  const [suggestion, setSuggestion] = useState<SolveResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal State for Neighbor Check
  const [neighborCheck, setNeighborCheck] = useState<{
    targetFieldIdx: number;
    neighborSide: 'left' | 'right'; // The side that MIGHT survive
    harvestedColor: CropColor; // Color of the crop just harvested
  } | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NEIGHBOR_CHECK);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // --- Persistence Effects ---
  useEffect(() => localStorage.setItem(STORAGE_KEYS.PARAMS, JSON.stringify(params)), [params]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.FIELD_COUNT, fieldCount.toString()), [fieldCount]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.FIELDS, JSON.stringify(fields)), [fields]);
  useEffect(() => {
    if (neighborCheck) localStorage.setItem(STORAGE_KEYS.NEIGHBOR_CHECK, JSON.stringify(neighborCheck));
    else localStorage.removeItem(STORAGE_KEYS.NEIGHBOR_CHECK);
  }, [neighborCheck]);


  // --- Game Logic Effects ---
  
  // Auto-Reset Effect: When all fields are inactive, reset after a delay
  useEffect(() => {
    const isGameOver = fields.every(f => !f.left.active && !f.right.active);
    
    // Only reset if game is over AND we aren't waiting for a neighbor check modal
    if (isGameOver && neighborCheck === null) {
      const timer = setTimeout(() => {
        setFields(generateFields(fieldCount));
      }, 1000); // 1 second delay to let user see the final state
      return () => clearTimeout(timer);
    }
  }, [fields, neighborCheck, fieldCount]);

  // Auto-calculate suggestion whenever fields change
  useEffect(() => {
    const runSolver = async () => {
      setLoading(true);
      // Small delay to allow UI to render first
      await new Promise(r => setTimeout(r, 10));
      
      clearMemo();
      const logicPlots: LogicPlot[] = [];
      fields.forEach(f => {
        if (f.left.active) logicPlots.push({ fieldId: f.id, side: 'left', color: f.left.color, k: f.left.k });
        if (f.right.active) logicPlots.push({ fieldId: f.id, side: 'right', color: f.right.color, k: f.right.k });
      });

      if (logicPlots.length > 0) {
        const res = solve(logicPlots, params);
        setSuggestion(res);
      } else {
        setSuggestion(null);
      }
      setLoading(false);
    };

    runSolver();
  }, [fields, params]);

  // --- Handlers ---

  const handleReset = () => {
    if (confirm("确定要重置所有田地吗？")) {
      setFields(generateFields(fieldCount));
      setNeighborCheck(null);
    }
  };

  const handleFieldCountChange = (count: number) => {
    setFieldCount(count);
    setFields(generateFields(count));
    setNeighborCheck(null);
  };

  // Update field setup (color/active) - only allowed if k=0 (setup phase logic, effectively)
  // or user just wants to fix a mistake before harvesting.
  const updatePlotConfig = (fieldIndex: number, side: 'left' | 'right', updates: Partial<PlotConfig>) => {
    const newFields = [...fields];
    const field = newFields[fieldIndex];
    if (side === 'left') field.left = { ...field.left, ...updates };
    else field.right = { ...field.right, ...updates };
    setFields(newFields);
  };

  const handleHarvestClick = (fieldIndex: number, side: 'left' | 'right') => {
    const field = fields[fieldIndex];
    const plot = side === 'left' ? field.left : field.right;
    const neighborSide = side === 'left' ? 'right' : 'left';
    const neighbor = side === 'left' ? field.right : field.left;

    // 1. Mark harvested plot as inactive immediately
    const newFields = [...fields];
    const targetField = newFields[fieldIndex];
    if (side === 'left') targetField.left.active = false;
    else targetField.right.active = false;
    
    // 2. Check Neighbor
    if (neighbor.active) {
      // Need to ask user about neighbor
      setFields(newFields);
      setNeighborCheck({
        targetFieldIdx: fieldIndex,
        neighborSide: neighborSide,
        harvestedColor: plot.color
      });
    } else {
      // No neighbor. Standard update.
      applyGlobalUpdate(newFields, plot.color, -1); // -1 means no neighbor specific update
    }
  };

  const handleNeighborResult = (survived: boolean) => {
    if (!neighborCheck) return;
    
    const { targetFieldIdx, neighborSide, harvestedColor } = neighborCheck;
    const newFields = [...fields];
    const targetField = newFields[targetFieldIdx];
    const neighborPlot = neighborSide === 'left' ? targetField.left : targetField.right;

    if (survived) {
      // Neighbor Survived logic
      if (neighborPlot.color !== harvestedColor) {
        neighborPlot.k += 1;
      }
      applyGlobalUpdate(newFields, harvestedColor, -1); // Standard global update
    } else {
      // Neighbor Withered logic
      neighborPlot.active = false;
      applyGlobalUpdate(newFields, harvestedColor, -1);
    }

    setNeighborCheck(null);
  };

  const applyGlobalUpdate = (currentFields: FieldConfig[], harvestedColor: CropColor, skipFieldIdx: number) => {
    const finalFields = currentFields.map((f, idx) => {
      const newF = { ...f };
      
      // Left
      if (newF.left.active && newF.left.color !== harvestedColor) {
        newF.left.k += 1;
      }
      
      // Right
      if (newF.right.active && newF.right.color !== harvestedColor) {
        newF.right.k += 1;
      }
      
      return newF;
    });
    setFields(finalFields);
  };

  // --- Settings Handlers ---
  const updateParam = (key: keyof GameParams, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setParams(prev => ({ ...prev, [key]: num }));
    }
  };
  const getWeightDisplay = (count: number) => {
    if (count <= 0) return "∞";
    const max = Math.max(params.buyCountPurple, params.buyCountBlue, params.buyCountYellow);
    return (max / count).toFixed(2) + 'x';
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      
      {/* Top Bar / Navigation */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <h1 className="text-lg font-extrabold text-indigo-900 hidden sm:block">
               策略计算器
             </h1>
             <div className="flex bg-gray-100 p-1 rounded-lg">
               <button 
                 onClick={() => setActiveTab('strategy')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'strategy' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 收割
               </button>
               <button 
                 onClick={() => setActiveTab('settings')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 设置
               </button>
             </div>
          </div>
          
          {activeTab === 'strategy' && (
            <div className="flex items-center gap-2">
              <button 
                 onClick={handleReset}
                 className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                 title="重置"
              >
                <IconRefresh className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        
        {activeTab === 'settings' && (
          <div className="animate-fadeIn space-y-6">
             {/* Survival Probability */}
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex justify-between">
                  <span>保留概率 (B)</span>
                  <span className="text-indigo-600">{Math.round(params.probSurvival * 100)}%</span>
                </h3>
                <input 
                  type="range" min="0" max="100"
                  value={Math.round(params.probSurvival * 100)}
                  onChange={(e) => updateParam('probSurvival', (parseInt(e.target.value) / 100).toString())}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
             </div>

             {/* Weights */}
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3">单位兑换量</h3>
                <div className="space-y-3">
                    <BuyCountInput label="紫" color="text-purple-600" value={params.buyCountPurple} multiplier={getWeightDisplay(params.buyCountPurple)} onChange={(v) => updateParam('buyCountPurple', v)} />
                    <BuyCountInput label="蓝" color="text-blue-600" value={params.buyCountBlue} multiplier={getWeightDisplay(params.buyCountBlue)} onChange={(v) => updateParam('buyCountBlue', v)} />
                    <BuyCountInput label="黄" color="text-yellow-600" value={params.buyCountYellow} multiplier={getWeightDisplay(params.buyCountYellow)} onChange={(v) => updateParam('buyCountYellow', v)} />
                </div>
             </div>

             {/* Advanced */}
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3">高级参数 (种子/概率)</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                     <ParamInput label="L1→L2" value={params.probL1toL2} onChange={v => updateParam('probL1toL2', v)} />
                     <ParamInput label="L2→L3" value={params.probL2toL3} onChange={v => updateParam('probL2toL3', v)} />
                     <ParamInput label="L3→L4" value={params.probL3toL4} onChange={v => updateParam('probL3toL4', v)} />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                     <ParamInput label="L1价" value={params.valL1} onChange={v => updateParam('valL1', v)} />
                     <ParamInput label="L2价" value={params.valL2} onChange={v => updateParam('valL2', v)} />
                     <ParamInput label="L3价" value={params.valL3} onChange={v => updateParam('valL3', v)} />
                     <ParamInput label="L4价" value={params.valL4} onChange={v => updateParam('valL4', v)} />
                  </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-4">
            
             {/* Unified Header Row: Field Count & Stats */}
             <div className="flex flex-wrap sm:flex-nowrap gap-3 mb-4">
                {/* Field Count Selector (Compact Horizontal) */}
                <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">田地数量</span>
                  <div className="flex gap-1">
                    {[3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => handleFieldCountChange(n)}
                        className={`px-3 py-1 text-sm font-bold rounded-lg transition-all ${fieldCount === n ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stats Card - Takes remaining space */}
                {suggestion ? (
                  <div className="flex-1 bg-indigo-900 text-white rounded-2xl p-3 shadow-md border border-indigo-800 flex justify-between items-center min-w-[200px]">
                    <div className="flex flex-col justify-center ml-2">
                      <div className="text-indigo-300 text-[10px] font-bold uppercase tracking-wider">预期总收益</div>
                      <div className="text-2xl font-black tracking-tight">{suggestion.maxEV.toFixed(1)}</div>
                    </div>
                    <div className="bg-indigo-800/50 rounded-lg px-3 py-1.5 text-right mr-1">
                      <div className="text-indigo-300 text-[10px]">剩余步数</div>
                      <div className="text-lg font-bold leading-none">{suggestion.path.length}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 border-dashed flex items-center justify-center text-gray-400 text-xs font-medium min-w-[200px]">
                    等待数据...
                  </div>
                )}
             </div>

            {/* Field Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((field, idx) => (
                <FieldCard 
                  key={field.id}
                  index={idx}
                  field={field}
                  bestMoveId={suggestion?.bestMoveId}
                  onUpdate={updatePlotConfig}
                  onHarvest={handleHarvestClick}
                />
              ))}
            </div>

            {suggestion && suggestion.path.length === 0 && (
              <div className="text-center py-8 text-gray-400 animate-pulse">
                 准备下一轮...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Neighbor Check Modal */}
      {neighborCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scaleIn">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold">?</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">另一块田还在吗？</h3>
              <p className="text-sm text-gray-500 mb-6">
                您收割了其中一块，根据 {Math.round(params.probSurvival * 100)}% 的概率，同一块田的另一侧是否幸存？
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleNeighborResult(false)}
                  className="py-3 px-4 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  🥀 枯萎了
                </button>
                <button 
                  onClick={() => handleNeighborResult(true)}
                  className="py-3 px-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-200"
                >
                  ✨ 幸存！
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

interface ParamInputProps { label: string; value: number; onChange: (v: string) => void; }
const ParamInput: React.FC<ParamInputProps> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-[10px] text-gray-400 uppercase font-bold mb-1">{label}</label>
    <input type="number" className="w-full border border-gray-200 rounded p-1 text-sm font-mono focus:border-indigo-500 outline-none" value={value} onChange={e => onChange(e.target.value)} />
  </div>
);

interface BuyCountInputProps { label: string; color: string; value: number; multiplier: string; onChange: (v: string) => void; }
const BuyCountInput: React.FC<BuyCountInputProps> = ({ label, color, value, multiplier, onChange }) => (
  <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100">
    <span className={`w-4 text-sm font-bold ${color}`}>{label}</span>
    <input 
      type="number" 
      className="flex-1 text-right border-none bg-transparent outline-none text-sm font-mono text-gray-700"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <span className="text-xs text-gray-400 font-mono bg-white px-2 py-0.5 rounded border border-gray-100 min-w-[3rem] text-center">{multiplier}</span>
  </div>
);

interface FieldCardProps { 
  index: number; 
  field: FieldConfig; 
  bestMoveId?: string;
  onUpdate: (idx: number, side: 'left' | 'right', u: Partial<PlotConfig>) => void;
  onHarvest: (idx: number, side: 'left' | 'right') => void;
}

const FieldCard: React.FC<FieldCardProps> = ({ index, field, bestMoveId, onUpdate, onHarvest }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="px-3 py-2 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">田地 {index + 1}</span>
      </div>
      <div className="flex divide-x divide-gray-100 h-40">
        <PlotUI 
          config={field.left} 
          isBest={bestMoveId === field.left.id}
          sideLabel="左"
          onUpdate={(u) => onUpdate(index, 'left', u)} 
          onHarvest={() => onHarvest(index, 'left')}
        />
        <PlotUI 
          config={field.right} 
          isBest={bestMoveId === field.right.id}
          sideLabel="右"
          onUpdate={(u) => onUpdate(index, 'right', u)} 
          onHarvest={() => onHarvest(index, 'right')}
        />
      </div>
    </div>
  );
};

interface PlotUIProps {
  config: PlotConfig;
  isBest: boolean;
  sideLabel: string;
  onUpdate: (u: Partial<PlotConfig>) => void;
  onHarvest: () => void;
}

const PlotUI: React.FC<PlotUIProps> = ({ config, isBest, sideLabel, onUpdate, onHarvest }) => {
  const colors: CropColor[] = ['purple', 'blue', 'yellow'];

  // Wasteland State
  if (!config.active) {
    return (
      <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center text-gray-300 gap-2 relative">
         <span className="absolute top-2 left-2 text-[10px] font-bold text-gray-300">{sideLabel}</span>
         <IconX className="w-8 h-8 opacity-20" />
         <span className="text-xs font-bold">荒地</span>
      </div>
    );
  }

  // Active State
  const bgColor = config.color === 'purple' ? 'bg-purple-50' : config.color === 'blue' ? 'bg-blue-50' : 'bg-amber-50';
  const textColor = config.color === 'purple' ? 'text-purple-700' : config.color === 'blue' ? 'text-blue-700' : 'text-amber-700';
  const ringColor = config.color === 'purple' ? 'ring-purple-400' : config.color === 'blue' ? 'ring-blue-400' : 'ring-amber-400';

  return (
    <div className={`flex-1 relative flex flex-col p-3 transition-all ${bgColor} ${isBest ? 'ring-inset ring-2 ' + ringColor : ''}`}>
      
      {/* Top: Label & Selector */}
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase">{sideLabel}</span>
        
        {/* Only allow changing color if k=0 (fresh crop) to avoid cheating/accidents mid-game */}
        {config.k === 0 && (
          <div className="flex gap-2">
            {colors.map(c => (
              <button
                key={c}
                onClick={() => onUpdate({ color: c })}
                className={`w-6 h-6 rounded-full shadow-sm transition-all ${c === config.color ? 'ring-2 ring-offset-1 ring-gray-300 scale-110 opacity-100' : 'opacity-40 hover:opacity-100 hover:scale-110'} 
                  ${c === 'purple' ? 'bg-purple-500' : c === 'blue' ? 'bg-blue-500' : 'bg-amber-400'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Center: Info */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className={`text-2xl font-black ${textColor}`}>Lv.{config.k}</div>
        <div className="h-1 w-8 bg-gray-200 rounded-full mt-1 overflow-hidden">
           <div className={`h-full ${textColor.replace('text', 'bg')} opacity-50`} style={{ width: `${Math.min((config.k / 4) * 100, 100)}%` }}></div>
        </div>
      </div>

      {/* Bottom: Action */}
      <div className="mt-2">
        <button
          onClick={onHarvest}
          className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-sm
            ${isBest 
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 animate-pulse-slow' 
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          {isBest && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span></span>}
          <IconSprout className="w-3.5 h-3.5" />
          收割
        </button>
      </div>
    </div>
  );
};
