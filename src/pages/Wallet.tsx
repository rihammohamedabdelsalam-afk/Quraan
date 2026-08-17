import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../lib/supabase';

import {
  Student,
  WalletTransaction,
} from '../lib/types';


// ============================================================
// Wallet
// ============================================================

type TransactionWithStudent = WalletTransaction & {
  student?: Student;
};

type FilterType = 'all' | 'today' | 'month';

export default function Wallet() {
  const [transactions, setTransactions] = useState<
    TransactionWithStudent[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] =
    useState<FilterType>('all');


  // ==========================================================
  // Current dates
  // ==========================================================

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const monthStart =
    today.slice(0, 7) + '-01';


  // ==========================================================
  // Load wallet
  // ==========================================================

  async function loadWallet(
    showRefreshing = false
  ) {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [
        {
          data: walletData,
          error: walletError,
        },
        {
          data: studentsData,
          error: studentsError,
        },
      ] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('*')
          .order('date', {
            ascending: false,
          })
          .order('id', {
            ascending: false,
          }),

        supabase
          .from('students')
          .select('*'),
      ]);

      if (walletError) {
        throw walletError;
      }

      if (studentsError) {
        throw studentsError;
      }

      const studentMap = new Map(
        (studentsData ?? []).map(
          (student) => [
            student.id,
            student,
          ]
        )
      );

      const result =
        (walletData ?? []).map(
          (transaction) => ({
            ...transaction,
            student:
              studentMap.get(
                transaction.student_id
              ),
          })
        );

      setTransactions(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تحميل المحفظة.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  // ==========================================================
  // Initial load
  // ==========================================================

  useEffect(() => {
    loadWallet();
  }, []);


  // ==========================================================
  // Wallet totals
  // ==========================================================

  const walletTotal = useMemo(() => {
    return transactions.reduce(
      (sum, transaction) =>
        sum +
        Number(transaction.amount || 0),
      0
    );
  }, [transactions]);


  const walletToday = useMemo(() => {
    return transactions
      .filter(
        (transaction) =>
          transaction.date === today
      )
      .reduce(
        (sum, transaction) =>
          sum +
          Number(
            transaction.amount || 0
          ),
        0
      );
  }, [transactions, today]);


  const walletMonth = useMemo(() => {
    return transactions
      .filter(
        (transaction) =>
          transaction.date >= monthStart
      )
      .reduce(
        (sum, transaction) =>
          sum +
          Number(
            transaction.amount || 0
          ),
        0
      );
  }, [
    transactions,
    monthStart,
  ]);


  // ==========================================================
  // Filter transactions
  // ==========================================================

  const filteredTransactions =
    useMemo(() => {
      if (filter === 'today') {
        return transactions.filter(
          (transaction) =>
            transaction.date === today
        );
      }

      if (filter === 'month') {
        return transactions.filter(
          (transaction) =>
            transaction.date >=
            monthStart
        );
      }

      return transactions;
    }, [
      transactions,
      filter,
      today,
      monthStart,
    ]);


  // ==========================================================
  // Loading
  // ==========================================================

  if (loading) {
    return (
      <div
        className="py-10 text-center text-ink/50"
        dir="rtl"
      >
        جارِ تحميل المحفظة...
      </div>
    );
  }


  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div
      className="space-y-6"
      dir="rtl"
    >

      {/* ======================================================
          Header
      ======================================================= */}

      <section className="card p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          <div>
            <h1 className="text-2xl font-extrabold text-moss-700">
              المحفظة
            </h1>

            <p className="text-sm text-ink/50 mt-1">
              كل ما يخص التحصيل والحركة المالية.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadWallet(true)
            }
            disabled={refreshing}
            className="btn-secondary"
          >
            {refreshing
              ? 'جارِ التحديث...'
              : 'تحديث البيانات'}
          </button>

        </div>
      </section>


      {/* ======================================================
          Error
      ======================================================= */}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}


      {/* ======================================================
          Wallet Summary
      ======================================================= */}

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <WalletSummaryCard
          label="تحصيل اليوم"
          value={walletToday}
        />

        <WalletSummaryCard
          label="تحصيل الشهر"
          value={walletMonth}
        />

        <WalletSummaryCard
          label="إجمالي المحفظة"
          value={walletTotal}
        />

      </section>


      {/* ======================================================
          Transactions
      ======================================================= */}

      <section className="card p-6">

        <div className="flex items-center justify-between gap-4 flex-wrap mb-5">

          <div>
            <h2 className="font-extrabold text-moss-700 text-lg">
              حركة المحفظة
            </h2>

            <p className="text-xs text-ink/50 mt-1">
              جميع عمليات التحصيل المسجلة.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">

            <FilterButton
              active={filter === 'all'}
              onClick={() =>
                setFilter('all')
              }
            >
              الكل
            </FilterButton>

            <FilterButton
              active={filter === 'today'}
              onClick={() =>
                setFilter('today')
              }
            >
              اليوم
            </FilterButton>

            <FilterButton
              active={filter === 'month'}
              onClick={() =>
                setFilter('month')
              }
            >
              هذا الشهر
            </FilterButton>

          </div>

        </div>


        {/* ====================================================
            Empty
        ===================================================== */}

        {filteredTransactions.length ===
        0 ? (
          <div className="bg-moss-50 rounded-2xl p-8 text-center">

            <div className="text-4xl mb-3">
              💰
            </div>

            <p className="font-bold text-moss-700">
              لا توجد عمليات مالية
            </p>

            <p className="text-sm text-ink/50 mt-1">
              لا توجد عمليات في الفترة المحددة.
            </p>

          </div>
        ) : (

          /* ==================================================
             Mobile / Desktop Transactions
          ================================================== */

          <div className="space-y-3">

            {filteredTransactions.map(
              (transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={
                    transaction
                  }
                />
              )
            )}

          </div>
        )}

      </section>


      {/* ======================================================
          Bottom Total
      ======================================================= */}

      <section className="card p-6">

        <div className="flex items-center justify-between gap-4">

          <div>
            <p className="text-sm text-ink/50">
              عدد العمليات
            </p>

            <p className="text-xl font-extrabold text-ink">
              {filteredTransactions.length}
            </p>
          </div>

          <div className="text-left">

            <p className="text-sm text-ink/50">
              إجمالي الفترة
            </p>

            <p className="text-2xl font-extrabold text-moss-700">
              {formatMoney(
                filteredTransactions.reduce(
                  (sum, transaction) =>
                    sum +
                    Number(
                      transaction.amount ||
                        0
                    ),
                  0
                )
              )}
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}


// ============================================================
// Wallet Summary Card
// ============================================================

function WalletSummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="card p-6">

      <p className="text-sm text-ink/50 mb-2">
        {label}
      </p>

      <p className="text-3xl font-extrabold text-moss-700">
        {formatMoney(value)}
      </p>

      <p className="text-xs text-ink/40 mt-1">
        جنيه
      </p>

    </div>
  );
}


// ============================================================
// Filter Button
// ============================================================

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'px-4 py-2 rounded-xl text-xs font-bold bg-moss-700 text-white'
          : 'px-4 py-2 rounded-xl text-xs font-bold bg-moss-50 text-moss-700 hover:bg-moss-100'
      }
    >
      {children}
    </button>
  );
}


// ============================================================
// Transaction Row
// ============================================================

function TransactionRow({
  transaction,
}: {
  transaction: TransactionWithStudent;
}) {
  const amount =
    Number(transaction.amount || 0);

  const positive =
    amount >= 0;

  return (
    <div className="border border-moss-100 rounded-2xl p-4 hover:bg-moss-50/40 transition">

      <div className="flex items-start justify-between gap-4 flex-wrap">

        {/* ====================================================
            Student / Description
        ===================================================== */}

        <div className="min-w-0 flex-1">

          {transaction.student ? (
            <Link
              to={`/students/${transaction.student.id}`}
              className="font-extrabold text-moss-700 hover:underline"
            >
              {transaction.student.name}
            </Link>
          ) : (
            <p className="font-extrabold text-ink">
              عملية مالية
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-2">

            <span className="pill bg-moss-50 text-moss-700">
              {formatTransactionType(
                transaction.type
              )}
            </span>

            <span className="text-xs text-ink/40">
              {formatDateValue(
                transaction.date
              )}
            </span>

          </div>

          {transaction.description && (
            <p className="text-sm text-ink/50 mt-3">
              {transaction.description}
            </p>
          )}

        </div>


        {/* ====================================================
            Amount
        ===================================================== */}

        <div className="text-left">

          <p
            className={`text-xl font-extrabold ${
              positive
                ? 'text-moss-700'
                : 'text-red-600'
            }`}
          >
            {positive
              ? '+'
              : ''}
            {formatMoney(amount)}
          </p>

          <p className="text-xs text-ink/40 mt-1">
            جنيه
          </p>

        </div>

      </div>

    </div>
  );
}


// ============================================================
// Transaction Type
// ============================================================

function formatTransactionType(
  type: string
): string {
  const normalized =
    type.trim().toLowerCase();

  const labels: Record<
    string,
    string
  > = {
    collection: 'تحصيل',
    collected: 'تحصيل',
    payment: 'تحصيل',
    income: 'إيراد',

    expense: 'مصروف',
    withdrawal: 'سحب',
    refund: 'استرداد',

    adjustment: 'تعديل',
    transfer: 'تحويل',
  };

  return (
    labels[normalized] ||
    type ||
    'عملية مالية'
  );
}


// ============================================================
// Format Money
// ============================================================

function formatMoney(
  value: number
): string {
  return new Intl.NumberFormat(
    'ar-EG',
    {
      maximumFractionDigits: 2,
    }
  ).format(value);
}


// ============================================================
// Format Date
// ============================================================

function formatDateValue(
  value: string
): string {
  if (!value) return '—';

  const parts =
    value.split('-');

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}