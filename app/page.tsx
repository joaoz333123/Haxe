'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Users,
  Wallet,
  ArrowRightLeft,
  Receipt,
  Cloud,
  CloudOff,
  X,
  Check,
  UserPlus,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export interface Participant {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  type: 'expense' | 'settlement';
  date: string;
  description: string;
  amount: number;
  paidBy: string;
  splitWith: string[];
  beneficiaries?: string[];
  createdAt: number;
}

export interface SettledCycle {
  id: string;
  settledAt: string;
  totalAmount: number;
  transactionsCount: number;
  settlementsSummary: Array<{ from: string; to: string; amount: number }>;
}

export interface DebtSettlement {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

const LOCAL_STORAGE_KEY = 'rateio_financeiro_local_v1';

export default function RateioApp() {
  const [participants, setParticipants] = useState<Participant[]>([
    { id: '1', name: 'João Zanetti' },
    { id: '2', name: 'Willian' },
    { id: '3', name: 'Weslen' },
  ]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settledCycles, setSettledCycles] = useState<SettledCycle[]>([]);

  const [syncStatus, setSyncStatus] = useState<'synced' | 'local' | 'syncing'>('synced');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expense' | 'settlement' | 'feed'>('dashboard');

  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [newParticipantName, setNewParticipantName] = useState('');

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [expenseSplitWith, setExpenseSplitWith] = useState<string[]>([]);

  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [settleDesc, setSettleDesc] = useState('Acerto PIX');
  const [settleAmount, setSettleAmount] = useState('');
  const [settlePaidBy, setSettlePaidBy] = useState('');
  const [settleBeneficiaries, setSettleBeneficiaries] = useState<string[]>([]);

  useEffect(() => {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed.participants) setParticipants(parsed.participants);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.settledCycles) setSettledCycles(parsed.settledCycles);
      } catch (e) {
        console.error(e);
      }
    }
    fetchCloudData();
  }, []);

  useEffect(() => {
    if (participants.length > 0) {
      if (!expensePaidBy && participants[0]) setExpensePaidBy(participants[0].id);
      if (expenseSplitWith.length === 0) setExpenseSplitWith(participants.map((p) => p.id));
      if (!settlePaidBy && participants[0]) setSettlePaidBy(participants[0].id);
    }
  }, [participants]);

  const fetchCloudData = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        if (data.participants?.length > 0) setParticipants(data.participants);
        if (data.transactions) setTransactions(data.transactions);
        if (data.settledCycles) setSettledCycles(data.settledCycles);
        setSyncStatus(data._offlineFallback ? 'local' : 'synced');
      } else {
        setSyncStatus('local');
      }
    } catch {
      setSyncStatus('local');
    }
  };

  const saveData = async (
    updatedParticipants: Participant[],
    updatedTransactions: Transaction[],
    updatedCycles: SettledCycle[]
  ) => {
    const payload = {
      participants: updatedParticipants,
      transactions: updatedTransactions,
      settledCycles: updatedCycles,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSyncStatus(res.ok ? 'synced' : 'local');
    } catch {
      setSyncStatus('local');
    }
  };

  const memberBalances = useMemo(() => {
    const balances: Record<string, { name: string; paid: number; consumed: number; net: number }> = {};
    participants.forEach((p) => {
      balances[p.id] = { name: p.name, paid: 0, consumed: 0, net: 0 };
    });

    transactions.forEach((t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'expense') {
        if (balances[t.paidBy]) balances[t.paidBy].paid += amount;
        const count = t.splitWith?.length || 1;
        const quota = amount / count;
        t.splitWith?.forEach((pid) => {
          if (balances[pid]) balances[pid].consumed += quota;
        });
      } else if (t.type === 'settlement') {
        if (balances[t.paidBy]) balances[t.paidBy].paid += amount;
        const beneficiaries = t.beneficiaries || [];
        const count = beneficiaries.length || 1;
        const quota = amount / count;
        beneficiaries.forEach((pid) => {
          if (balances[pid]) balances[pid].consumed += quota;
        });
      }
    });

    Object.keys(balances).forEach((pid) => {
      balances[pid].net = balances[pid].paid - balances[pid].consumed;
    });
    return balances;
  }, [participants, transactions]);

  const suggestedSettlements = useMemo(() => {
    const debtors: { id: string; name: string; amount: number }[] = [];
    const creditors: { id: string; name: string; amount: number }[] = [];

    Object.entries(memberBalances).forEach(([id, b]) => {
      const net = Math.round(b.net * 100) / 100;
      if (net < -0.01) debtors.push({ id, name: b.name, amount: Math.abs(net) });
      else if (net > 0.01) creditors.push({ id, name: b.name, amount: net });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: DebtSettlement[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const payment = Math.min(debtor.amount, creditor.amount);

      if (payment > 0.01) {
        settlements.push({
          fromId: debtor.id,
          fromName: debtor.name,
          toId: creditor.id,
          toName: creditor.name,
          amount: Math.round(payment * 100) / 100,
        });
      }

      debtor.amount -= payment;
      creditor.amount -= payment;

      if (debtor.amount <= 0.01) i++;
      if (creditor.amount <= 0.01) j++;
    }
    return settlements;
  }, [memberBalances]);

  const totalExpenseAmount = useMemo(() => {
    return transactions.filter((t) => t.type === 'expense').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  }, [transactions]);

  const handleSaveParticipant = () => {
    if (!newParticipantName.trim()) return;
    let updated: Participant[];
    if (editingParticipant) {
      updated = participants.map((p) => (p.id === editingParticipant.id ? { ...p, name: newParticipantName.trim() } : p));
    } else {
      updated = [...participants, { id: Date.now().toString(), name: newParticipantName.trim() }];
    }
    setParticipants(updated);
    saveData(updated, transactions, settledCycles);
    setNewParticipantName('');
    setEditingParticipant(null);
    setIsParticipantModalOpen(false);
  };

  const handleDeleteParticipant = (id: string) => {
    const isUsed = transactions.some((t) => t.paidBy === id || t.splitWith?.includes(id));
    if (isUsed) {
      alert('Não é possível excluir participante vinculado a lançamentos.');
      return;
    }
    if (confirm('Remover participante?')) {
      const updated = participants.filter((p) => p.id !== id);
      setParticipants(updated);
      saveData(updated, transactions, settledCycles);
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(expenseAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !expensePaidBy || expenseSplitWith.length === 0) {
      alert('Preencha os campos corretamente.');
      return;
    }
    const newTx: Transaction = {
      id: editingTransaction ? editingTransaction.id : Date.now().toString(),
      type: 'expense',
      date: expenseDate || new Date().toISOString().split('T')[0],
      description: expenseDesc.trim() || 'Despesa',
      amount: val,
      paidBy: expensePaidBy,
      splitWith: expenseSplitWith,
      createdAt: editingTransaction ? editingTransaction.createdAt : Date.now(),
    };
    const updated = editingTransaction
      ? transactions.map((t) => (t.id === editingTransaction.id ? newTx : t))
      : [newTx, ...transactions];
    setTransactions(updated);
    saveData(participants, updated, settledCycles);
    setExpenseDesc('');
    setExpenseAmount('');
    setEditingTransaction(null);
    setActiveTab('feed');
  };

  const handleAddSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(settleAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !settlePaidBy || settleBeneficiaries.length === 0) {
      alert('Preencha os campos do PIX corretamente.');
      return;
    }
    const newTx: Transaction = {
      id: editingTransaction ? editingTransaction.id : Date.now().toString(),
      type: 'settlement',
      date: settleDate || new Date().toISOString().split('T')[0],
      description: settleDesc.trim() || 'Acerto PIX',
      amount: val,
      paidBy: settlePaidBy,
      splitWith: [],
      beneficiaries: settleBeneficiaries,
      createdAt: editingTransaction ? editingTransaction.createdAt : Date.now(),
    };
    const updated = editingTransaction
      ? transactions.map((t) => (t.id === editingTransaction.id ? newTx : t))
      : [newTx, ...transactions];
    setTransactions(updated);
    saveData(participants, updated, settledCycles);
    setSettleAmount('');
    setEditingTransaction(null);
    setActiveTab('feed');
  };

  const handleConfirmSettleAccount = () => {
    const cycle: SettledCycle = {
      id: Date.now().toString(),
      settledAt: new Date().toLocaleDateString('pt-BR'),
      totalAmount: totalExpenseAmount,
      transactionsCount: transactions.length,
      settlementsSummary: suggestedSettlements.map((s) => ({ from: s.fromName, to: s.toName, amount: s.amount })),
    };
    const updatedCycles = [cycle, ...settledCycles];
    setTransactions([]);
    setSettledCycles(updatedCycles);
    saveData(participants, [], updatedCycles);
    setIsSettleModalOpen(false);
    setActiveTab('dashboard');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-24 max-w-md mx-auto relative border-x border-slate-800">
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
            <Receipt className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white flex items-center gap-1">
              Rateio Fácil <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h1>
            <span className="text-[11px] text-slate-400">Acerto de Contas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsParticipantModalOpen(true)} className="p-2 bg-slate-800 rounded-xl border border-slate-700">
            <Users className="w-4 h-4 text-emerald-400" />
          </button>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {syncStatus === 'synced' && <Cloud className="w-3.5 h-3.5" />}
            {syncStatus === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {syncStatus === 'local' && <CloudOff className="w-3.5 h-3.5 text-amber-400" />}
            <span>{syncStatus === 'synced' ? 'Nuvem' : syncStatus === 'syncing' ? 'Salvando' : 'Offline'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
                <span className="text-xs text-slate-400">Total Despesas</span>
                <span className="text-xl font-bold text-white block mt-1">{formatCurrency(totalExpenseAmount)}</span>
              </div>
              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700 flex flex-col justify-between">
                <span className="text-xs text-slate-400">Pessoas</span>
                <span className="text-xl font-bold text-emerald-400 mt-1">{participants.length} Pessoas</span>
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" /> Saldos Individuais
              </h2>
              <div className="space-y-2">
                {participants.map((p) => {
                  const bal = memberBalances[p.id] || { paid: 0, consumed: 0, net: 0 };
                  const isCredit = bal.net > 0.01;
                  const isDebt = bal.net < -0.01;
                  return (
                    <div key={p.id} className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-sm text-white">{p.name}</span>
                        <div className="text-[11px] text-slate-400">Pago: {formatCurrency(bal.paid)}</div>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold text-sm block ${isCredit ? 'text-emerald-400' : isDebt ? 'text-rose-400' : 'text-slate-400'}`}>
                          {isCredit ? '+' : ''}{formatCurrency(bal.net)}
                        </span>
                        <span className="text-[10px] text-slate-400">{isCredit ? 'Recebe' : isDebt ? 'Deve' : 'Quitado'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-950/40 to-slate-800 rounded-2xl p-4 border border-emerald-500/20 space-y-3">
              <h2 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" /> Quem deve quanto para quem (PIX)
              </h2>
              {suggestedSettlements.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Tudo quitado! Nenhuma transferência pendente.</p>
              ) : (
                suggestedSettlements.map((s, idx) => (
                  <div key={idx} className="bg-slate-900/90 p-3 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-rose-300">{s.fromName}</strong> paga para <strong className="text-emerald-300">{s.toName}</strong>
                    </div>
                    <span className="font-bold text-white text-sm">{formatCurrency(s.amount)}</span>
                  </div>
                ))
              )}
            </div>

            {transactions.length > 0 && (
              <button onClick={() => setIsSettleModalOpen(true)} className="w-full h-12 bg-slate-800 text-slate-200 border border-slate-700 font-semibold rounded-2xl flex items-center justify-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Liquidar e Zerar Ciclo
              </button>
            )}
          </div>
        )}

        {activeTab === 'expense' && (
          <form onSubmit={handleAddExpense} className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-white">Nova Despesa</h2>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white" />
              <input type="text" inputMode="decimal" placeholder="0,00" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-base font-bold text-emerald-400" />
            </div>
            <input type="text" placeholder="Descrição / Local" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white" />
            <div>
              <label className="text-xs text-slate-300 block mb-1">Quem Pagou?</label>
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => (
                  <button key={p.id} type="button" onClick={() => setExpensePaidBy(p.id)} className={`h-10 px-3 rounded-xl text-xs ${expensePaidBy === p.id ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-300 border border-slate-700'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full h-12 bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm">Salvar Despesa</button>
          </form>
        )}

        {activeTab === 'settlement' && (
          <form onSubmit={handleAddSettlement} className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 space-y-4">
            <h2 className="text-base font-bold text-white">Abatimento / PIX</h2>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} className="h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white" />
              <input type="text" inputMode="decimal" placeholder="0,00" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className="h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-base font-bold text-emerald-400" />
            </div>
            <input type="text" placeholder="Descrição" value={settleDesc} onChange={(e) => setSettleDesc(e.target.value)} className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white" />
            <button type="submit" className="w-full h-12 bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm">Registrar PIX</button>
          </form>
        )}

        {activeTab === 'feed' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Extrato de Lançamentos</h2>
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
                <div>
                  <strong className="text-white block">{tx.description}</strong>
                  <span className="text-slate-400">{participants.find((p) => p.id === tx.paidBy)?.name} pagou</span>
                </div>
                <span className="font-bold text-sm text-white">{formatCurrency(tx.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 border-t border-slate-800 p-2 z-40">
        <div className="grid grid-cols-4 gap-1">
          <button onClick={() => setActiveTab('dashboard')} className={`py-2 text-center rounded-xl ${activeTab === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>Saldos</button>
          <button onClick={() => setActiveTab('expense')} className={`py-2 text-center rounded-xl ${activeTab === 'expense' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>Despesa</button>
          <button onClick={() => setActiveTab('settlement')} className={`py-2 text-center rounded-xl ${activeTab === 'settlement' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>PIX</button>
          <button onClick={() => setActiveTab('feed')} className={`py-2 text-center rounded-xl ${activeTab === 'feed' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>Extrato</button>
        </div>
      </nav>
    </div>
  );
}
