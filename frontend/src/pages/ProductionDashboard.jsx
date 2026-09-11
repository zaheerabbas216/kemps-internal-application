import React from 'react';
import { useNavigate } from 'react-router-dom';

const ProductionDashboard = () => {
  const navigate = useNavigate();

  const shortcuts = [
    {
      title: 'PET Bottle Production',
      tag: 'Blowing & Preforms',
      path: '/pet-bottle',
      icon: '🍼',
      color: 'from-cyan-500 to-blue-600',
      bgGlow: 'bg-cyan-500/10 border-cyan-200/80 hover:border-cyan-400',
      tagColor: 'bg-cyan-100/80 text-cyan-800 border-cyan-200',
      description: 'Log bottle blowing batches, preform consumption, bag counts, blown bottles, and scrap rejection monitoring.'
    },
    {
      title: 'Production',
      tag: 'Bottling & Packaging',
      path: '/production-form',
      icon: '🏭',
      color: 'from-indigo-600 to-violet-600',
      bgGlow: 'bg-indigo-500/10 border-indigo-200/80 hover:border-indigo-400',
      tagColor: 'bg-indigo-100/80 text-indigo-800 border-indigo-200',
      description: 'Record water bottling batches, packaging material usage (caps, labels, boxes), and final finished stock output.'
    },
    {
      title: 'Raw Material Ledger',
      tag: 'Materials Stock',
      path: '/raw-material-ledger',
      icon: '🪨',
      color: 'from-amber-500 to-orange-600',
      bgGlow: 'bg-amber-500/10 border-amber-200/80 hover:border-amber-400',
      tagColor: 'bg-amber-100/80 text-amber-800 border-amber-200',
      description: 'Check available preforms, labels, caps, shrink rolls, and packaging inventory before initiating production runs.'
    },
    {
      title: 'Goods Ledger',
      tag: 'Finished Inventory',
      path: '/goods-ledger',
      icon: '📦',
      color: 'from-blue-600 to-indigo-600',
      bgGlow: 'bg-blue-500/10 border-blue-200/80 hover:border-blue-400',
      tagColor: 'bg-blue-100/80 text-blue-800 border-blue-200',
      description: 'Verify warehouse additions from finished batches and monitor live balances of bottled products.'
    },
    {
      title: 'Order Details',
      tag: 'Demand & Dispatch',
      path: '/order-details',
      icon: '📋',
      color: 'from-rose-500 to-pink-600',
      bgGlow: 'bg-rose-500/10 border-rose-200/80 hover:border-rose-400',
      tagColor: 'bg-rose-100/80 text-rose-800 border-rose-200',
      description: 'Review pending customer production orders, product demand schedules, and planned vehicle loading dispatches.'
    },
    {
      title: 'Machine Timer',
      tag: 'Line Timers & Efficiency',
      path: '/timer',
      icon: '⏱️',
      color: 'from-emerald-600 to-teal-600',
      bgGlow: 'bg-emerald-500/10 border-emerald-200/80 hover:border-emerald-400',
      tagColor: 'bg-emerald-100/80 text-emerald-800 border-emerald-200',
      description: 'Track machine start/stop running hours, production speeds, power on/off sessions, and line downtime efficiency.'
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="card-premium p-6 sm:p-8 relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#131b34] to-[#1e1b4b] text-white">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border border-indigo-500/30">
                QUICK ACCESS WORKSPACE
              </span>
              <span className="text-slate-400 text-xs font-semibold">Manufacturing & Factory Operations</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>🏭</span> Production Dashboard
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium mt-1.5 max-w-xl leading-relaxed">
              Fast access to PET bottle blowing, water bottling, ledgers, order demand, and line timer trackers.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5 active:scale-95"
            >
              <span>←</span> Main Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Shortcuts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shortcuts.map((sc, idx) => (
          <div
            key={idx}
            onClick={() => navigate(sc.path)}
            className={`group card-premium p-6 cursor-pointer border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden flex flex-col justify-between ${sc.bgGlow}`}
          >
            <div>
              {/* Header Icon + Tag */}
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${sc.color} text-white text-2xl flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-110 transition-transform duration-300`}>
                  {sc.icon}
                </div>
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border tracking-wider ${sc.tagColor}`}>
                  {sc.tag}
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-lg font-black text-slate-800 tracking-tight group-hover:text-primary transition-colors flex items-center gap-1.5">
                {sc.title}
              </h3>
              <p className="text-slate-500 text-xs font-medium leading-relaxed mt-2">
                {sc.description}
              </p>
            </div>

            {/* Bottom Action */}
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 group-hover:text-primary transition-colors flex items-center gap-1">
                Open Shortcut
              </span>
              <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center text-slate-600 font-black text-xs transition-all duration-300">
                →
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductionDashboard;
