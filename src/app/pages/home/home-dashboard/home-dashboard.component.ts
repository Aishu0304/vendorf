import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface VendorKPIs {
  totalOrders: number;
  totalDeliveries: number;
  pendingInvoices: number;
  activeRFQs: number;
  orderGrowth: number;
  onTimeDeliveryRate: number;
  avgPaymentDays: number;
  newRFQs: number;
  overduePayments: number;
}

@Component({
  selector: 'app-home-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-dashboard.component.html',
  styleUrls: ['./home-dashboard.component.scss']
})
export class HomeDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  kpis: VendorKPIs = {
    totalOrders: 0,
    totalDeliveries: 0,
    pendingInvoices: 0,
    activeRFQs: 0,
    orderGrowth: 0,
    onTimeDeliveryRate: 0,
    avgPaymentDays: 0,
    newRFQs: 0,
    overduePayments: 0
  };

  isLoading = true;
  vendorId: string = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.vendorId = localStorage.getItem('vendorId') || '';
    if (this.vendorId) {
      this.loadDashboardData();
    } else {
      this.setDefaultKPIs();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDashboardData(): void {
    const formattedVendorId = this.vendorId.padStart(10, '0');

    // Load all data in parallel
    forkJoin({
      purchaseOrders: this.http.post<any>('http://localhost:3030/purchaseorder', { vendorId: formattedVendorId }).pipe(
        catchError(() => of([]))
      ),
      deliveries: this.http.post<any>('http://localhost:3030/goods', { vendorId: formattedVendorId }).pipe(
        catchError(() => of([]))
      ),
      invoices: this.http.post<any>('http://localhost:3030/invoice', { vendorId: formattedVendorId }).pipe(
        catchError(() => of([]))
      ),
      quotations: this.http.post<any>('http://localhost:3030/quotation', { vendorId: formattedVendorId }).pipe(
        catchError(() => of([]))
      ),
      aging: this.http.post<any>('http://localhost:3030/aging', { vendorId: formattedVendorId }).pipe(
        catchError(() => of([]))
      )
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.calculateKPIs(data);
        this.isLoading = false;
      },
      error: () => {
        this.setDefaultKPIs();
        this.isLoading = false;
      }
    });
  }

  private calculateKPIs(data: any): void {
    // Extract arrays from responses
    const purchaseOrders = Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [];
    const deliveries = Array.isArray(data.deliveries) ? data.deliveries : [];
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const quotations = Array.isArray(data.quotations) ? data.quotations : [];
    const aging = Array.isArray(data.aging) ? data.aging : [];

    // Calculate KPIs
    this.kpis = {
      totalOrders: purchaseOrders.length,
      totalDeliveries: deliveries.length,
      pendingInvoices: invoices.length,
      activeRFQs: quotations.length,
      orderGrowth: this.calculateGrowthRate(purchaseOrders),
      onTimeDeliveryRate: this.calculateOnTimeDeliveryRate(deliveries),
      avgPaymentDays: this.calculateAvgPaymentDays(aging),
      newRFQs: this.calculateNewRFQs(quotations),
      overduePayments: this.calculateOverduePayments(aging)
    };
  }

  private calculateGrowthRate(orders: any[]): number {
    if (orders.length === 0) return 0;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const currentMonthOrders = orders.filter(order => {
      try {
        const orderDate = new Date(order.Aedat || order.createdDate);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;

    const lastMonthOrders = orders.filter(order => {
      try {
        const orderDate = new Date(order.Aedat || order.createdDate);
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return orderDate.getMonth() === lastMonth && orderDate.getFullYear() === lastMonthYear;
      } catch {
        return false;
      }
    }).length;

    if (lastMonthOrders === 0) return currentMonthOrders > 0 ? 100 : 0;
    return Math.round(((currentMonthOrders - lastMonthOrders) / lastMonthOrders) * 100);
  }

  private calculateOnTimeDeliveryRate(deliveries: any[]): number {
    if (deliveries.length === 0) return 0;
    
    const onTimeDeliveries = deliveries.filter(delivery => {
      // Assume deliveries with status 'C' (Complete) are on time
      return (delivery.Gbstk || delivery.status || '').toString().toUpperCase() === 'C';
    }).length;

    return Math.round((onTimeDeliveries / deliveries.length) * 100);
  }

  private calculateAvgPaymentDays(aging: any[]): number {
    if (aging.length === 0) return 0;
    
    const totalDays = aging.reduce((sum, item) => {
      const agingDays = parseInt(item.Aging || item.aging || '0');
      return sum + agingDays;
    }, 0);

    return Math.round(totalDays / aging.length);
  }

  private calculateNewRFQs(quotations: any[]): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return quotations.filter(quotation => {
      try {
        const quotationDate = new Date(quotation.Aedat || quotation.createdDate);
        return quotationDate >= oneWeekAgo;
      } catch {
        return false;
      }
    }).length;
  }

  private calculateOverduePayments(aging: any[]): number {
    return aging.filter(item => {
      const agingDays = parseInt(item.Aging || item.aging || '0');
      return agingDays > 30; // Consider payments overdue after 30 days
    }).length;
  }

  private setDefaultKPIs(): void {
    this.kpis = {
      totalOrders: 24,
      totalDeliveries: 18,
      pendingInvoices: 6,
      activeRFQs: 12,
      orderGrowth: 15,
      onTimeDeliveryRate: 92,
      avgPaymentDays: 28,
      newRFQs: 4,
      overduePayments: 2
    };
    this.isLoading = false;
  }
}