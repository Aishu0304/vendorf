import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

interface RFQKPIs {
  totalRFQs: number;
  activeRFQs: number;
  pendingResponse: number;
  successRate: number;
  newThisMonth: number;
  avgResponseTime: number;
  urgentRFQs: number;
  successRateChange: number;
}

@Component({
  selector: 'app-dashboard-quotation',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    RouterModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule,
    MatSortModule,
    MatTooltipModule
  ],
  templateUrl: './dashboard-inquiry.component.html',
  styleUrls: ['./dashboard-inquiry.component.scss'],
  providers: [DatePipe]
})
export class DashboardInquiryComponent implements OnInit {
  quotations: Quotation[] = [];
  filteredQuotations: Quotation[] = [];

  displayedColumns: string[] = [
    'quotationNo', 'rfqType', 'rfqDate', 'vendor', 'material', 'description', 'quantity', 'unit', 'actions'
  ];

  isLoading: boolean = false;
  error: string = '';
  hoveredRow: string | null = null;

  // Filter properties
  searchText: string = '';
  rfqTypeFilter: string = '';
  dateRangeFilter: { start: Date | null; end: Date | null } = { start: null, end: null };
  rfqTypes: string[] = [];
  selectedQuotation: Quotation | null = null;

  // KPI properties
  rfqKpis: RFQKPIs = {
    totalRFQs: 0,
    activeRFQs: 0,
    pendingResponse: 0,
    successRate: 0,
    newThisMonth: 0,
    avgResponseTime: 0,
    urgentRFQs: 0,
    successRateChange: 0
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private snackBar: MatSnackBar,
    private datePipe: DatePipe
  ) {}

  ngOnInit(): void {
    const vendorId = localStorage.getItem('vendorId');
    if (vendorId) {
      this.loadQuotations(vendorId);
    } else {
      this.error = 'Vendor ID not found. Please log in.';
      this.snackBar.open(this.error, 'Close', { duration: 5000 });
      this.router.navigate(['/login']);
    }
  }

  loadQuotations(vendorId: string): void {
    this.isLoading = true;
    this.error = '';

    this.http.post<any>('http://localhost:3030/quotation', { vendorId }).subscribe({
      next: (response) => {
        console.log('Backend response:', response);

        const quotationsRaw = Array.isArray(response) ? response : (response.quotations || []);

        this.quotations = quotationsRaw.map((item: any) => ({
          quotationNo: item.Ebeln,
          createdDate: item.Aedat,
          rfqType: item.Bsart,
          rfqDate: item.Angdt,
          validToDate: item.Bnddt,
          vendor: item.Lifnr,
          material: item.Matnr,
          description: item.Txz01,
          quantity: item.Menge || 'N/A',
          unit: item.Meins || 'N/A',
          rawCreatedDate: this.parseODataDate(item.Aedat),
          rawRfqDate: this.parseODataDate(item.Angdt),
          rawValidToDate: this.parseODataDate(item.Bnddt)
        }));

        this.filteredQuotations = [...this.quotations];
        this.rfqTypes = [...new Set(this.quotations.map(item => item.rfqType))];
        
        // Calculate KPIs
        this.calculateRFQKPIs();
        
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'Unable to load quotations. Please try again later.';
        this.snackBar.open(this.error, 'Close', { duration: 5000 });
        this.isLoading = false;
        console.error('Quotation load error:', err);
      }
    });
  }

  private calculateRFQKPIs(): void {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Calculate total RFQs
    this.rfqKpis.totalRFQs = this.quotations.length;

    // Calculate active RFQs (assuming those with valid future dates are active)
    this.rfqKpis.activeRFQs = this.quotations.filter(q => {
      const validDate = q.rawValidToDate;
      return validDate && validDate > currentDate;
    }).length;

    // Calculate new RFQs this month
    this.rfqKpis.newThisMonth = this.quotations.filter(q => {
      const createdDate = q.rawCreatedDate;
      return createdDate && 
             createdDate.getMonth() === currentMonth && 
             createdDate.getFullYear() === currentYear;
    }).length;

    // Calculate pending response (assuming RFQs created in last 30 days without response)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    this.rfqKpis.pendingResponse = this.quotations.filter(q => {
      const rfqDate = q.rawRfqDate;
      return rfqDate && rfqDate >= thirtyDaysAgo && rfqDate <= currentDate;
    }).length;

    // Calculate urgent RFQs (those expiring within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    this.rfqKpis.urgentRFQs = this.quotations.filter(q => {
      const validDate = q.rawValidToDate;
      return validDate && validDate <= sevenDaysFromNow && validDate > currentDate;
    }).length;

    // Calculate average response time (mock calculation)
    this.rfqKpis.avgResponseTime = Math.round(Math.random() * 5 + 2); // 2-7 days

    // Calculate success rate (mock calculation based on active vs total)
    this.rfqKpis.successRate = this.rfqKpis.totalRFQs > 0 
      ? Math.round((this.rfqKpis.activeRFQs / this.rfqKpis.totalRFQs) * 100)
      : 0;

    // Calculate success rate change (mock)
    this.rfqKpis.successRateChange = Math.round(Math.random() * 10 + 2); // 2-12%
  }

  parseODataDate(odataDateString: string | null): Date | undefined {
    if (!odataDateString) return undefined;
    const timestamp = parseInt(odataDateString.replace('/Date(', '').replace(')/', ''), 10);
    return new Date(timestamp);
  }

  formatDate(odataDateString: string): string {
    if (!odataDateString) return '';
    const timestamp = parseInt(odataDateString.replace('/Date(', '').replace(')/', ''), 10);
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  applyFilters(): void {
    this.filteredQuotations = this.quotations.filter(quotation => {
      const matchesSearch = !this.searchText ||
        quotation.quotationNo.toLowerCase().includes(this.searchText.toLowerCase()) ||
        quotation.description.toLowerCase().includes(this.searchText.toLowerCase()) ||
        quotation.material.toLowerCase().includes(this.searchText.toLowerCase());

      const matchesRfqType = !this.rfqTypeFilter ||
        quotation.rfqType === this.rfqTypeFilter;

      let matchesDateRange = true;
      if (this.dateRangeFilter.start || this.dateRangeFilter.end) {
        const rfqDate = new Date(quotation.rawRfqDate!);
        const start = this.dateRangeFilter.start ? new Date(this.dateRangeFilter.start) : null;
        const end = this.dateRangeFilter.end ? new Date(this.dateRangeFilter.end) : null;

        if (start && rfqDate < start) matchesDateRange = false;
        if (end && rfqDate > end) matchesDateRange = false;
      }

      return matchesSearch && matchesRfqType && matchesDateRange;
    });
  }

  clearFilters(): void {
    this.searchText = '';
    this.rfqTypeFilter = '';
    this.dateRangeFilter = { start: null, end: null };
    this.filteredQuotations = [...this.quotations];
  }

  sortData(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      this.filteredQuotations = [...this.filteredQuotations];
      return;
    }

    this.filteredQuotations = this.filteredQuotations.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'quotationNo': return compare(a.quotationNo, b.quotationNo, isAsc);
        case 'createdDate': return compare(a.rawCreatedDate!, b.rawCreatedDate!, isAsc);
        case 'rfqDate': return compare(a.rawRfqDate!, b.rawRfqDate!, isAsc);
        case 'validToDate': return compare(a.rawValidToDate!, b.rawValidToDate!, isAsc);
        default: return 0;
      }
    });
  }

  viewDetails(quotationNo: string): void {
    const quotation = this.quotations.find(q => q.quotationNo === quotationNo);
    if (quotation) {
      this.selectedQuotation = quotation;
    } else {
      this.snackBar.open('Quotation not found', 'Close', { duration: 3000 });
    }
  }
}

export interface Quotation {
  quotationNo: string;
  createdDate: string;
  rfqType: string;
  rfqDate: string;
  validToDate: string;
  vendor: string;
  material: string;
  description: string;
  quantity: string;
  unit: string;
  rawCreatedDate: Date | undefined;
  rawRfqDate: Date | undefined;
  rawValidToDate: Date | undefined;
}

function compare(a: number | string | Date, b: number | string | Date, isAsc: boolean): number {
  return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
}