import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Check, Tag } from 'lucide-react';

interface ManageTiposModalProps {
  isOpen: boolean;
  onClose: () => void;
  tipos: string[];
  onSaveTipos: (updatedTipos: string[]) => void;
  onSelectTipo: (tipo: string) => void;
}

export const ManageTiposModal: React.FC<ManageTiposModalProps> = ({
  isOpen,
  onClose,
  tipos,
  onSaveTipos,
  onSelectTipo,
}) => {
  const [newTipo, setNewTipo] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddTipo = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmed = newTipo.trim().toUpperCase();
    if (!trimmed) return;
    if (tipos.includes(trimmed)) {
      setErrorMessage('Este tipo de contrato já existe.');
      return;
    }
    const updated = [...tipos, trimmed];
    onSaveTipos(updated);
    onSelectTipo(trimmed);
    setNewTipo('');
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(tipos[index]);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingValue.trim().toUpperCase();
    if (!trimmed) return;
    const updated = [...tipos];
    updated[index] = trimmed;
    onSaveTipos(updated);
    setEditingIndex(null);
  };

  const handleDeleteTipo = (index: number) => {
    setErrorMessage(null);
    if (tipos.length <= 1) {
      setErrorMessage('O sistema deve possuir ao menos um tipo de contrato.');
      return;
    }
    const updated = tipos.filter((_, i) => i !== index);
    onSaveTipos(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-slate-300">
        {/* Header */}
        <div className="bg-[#1b346d] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-300" />
            <h3 className="text-xs font-black uppercase tracking-wider">
              GERENCIAR TIPOS DE CONTRATO
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Add New Type Form */}
          <form onSubmit={handleAddTipo} className="flex gap-2">
            <input
              type="text"
              placeholder="NOVO TIPO DE CONTRATO (EX: CONSULTORIA)..."
              value={newTipo}
              onChange={(e) => setNewTipo(e.target.value)}
              className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded uppercase font-semibold focus:ring-1 focus:ring-blue-600 outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>CRIAR</span>
            </button>
          </form>

          {/* List of Current Types */}
          <div className="border border-slate-200 rounded divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {tipos.map((tipo, idx) => (
              <div
                key={tipo + idx}
                className="flex items-center justify-between p-2.5 hover:bg-slate-50 text-xs"
              >
                {editingIndex === idx ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="flex-1 px-2 py-1 border border-blue-400 rounded text-xs uppercase font-bold outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveEdit(idx)}
                      className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                      title="Salvar alteração"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingIndex(null)}
                      className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 cursor-pointer"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-slate-800 uppercase tracking-wide">
                      {tipo}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          onSelectTipo(tipo);
                          onClose();
                        }}
                        className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[10px] font-semibold cursor-pointer"
                        title="Selecionar este tipo"
                      >
                        USAR
                      </button>
                      <button
                        onClick={() => handleStartEdit(idx)}
                        className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer transition-colors"
                        title="Editar nome"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTipo(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                        title="Excluir tipo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 italic text-center">
            Tipos cadastrados ficam disponíveis no menu de seleção de contratos.
          </p>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-5 py-2.5 flex justify-end border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 cursor-pointer"
          >
            CONCLUIR
          </button>
        </div>
      </div>
    </div>
  );
};
