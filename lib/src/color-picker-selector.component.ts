import {
    AfterViewInit,
    Component,
    ChangeDetectionStrategy,
    HostListener,
    Input,
    ElementRef,
    EventEmitter,
    OnInit,
    OnChanges,
    OnDestroy,
    Output,
    Renderer2,
    ViewChild,
    SimpleChanges
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';

interface ColorOption {
    type: string;
    value: number;
}

@Component({
    selector: 'mat-color-picker-selector',
    templateUrl: './color-picker-selector.component.html',
    styleUrls: ['./color-picker-selector.component.scss'],
    preserveWhitespaces: false,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatColorPickerSelectorComponent implements
    AfterViewInit, OnInit, OnChanges, OnDestroy {

    /**
     * ElemenRef of the main color
     */
    @ViewChild('block') _block: ElementRef;

    /**
     * ElemenRef of the pointer main color
     */
    @ViewChild('blockPointer') _bp: ElementRef;

    /**
     * Canvas of the block
     */
    @ViewChild('blockCanvas') set blockCursor(el: ElementRef) { this._bc = el; }
    private _bc: ElementRef;
    private _blockContext: any;

    /**
     * ElementRef of the color base
     */
    @ViewChild('strip') _strip: ElementRef;
    // hold _strip context
    private _stripContext: any;

    /**
     * Container of the strip
     */
    @ViewChild('stripContainer') set stripCursor(el: ElementRef) { this._sc = el; }
    private _sc: ElementRef;

    /**
     * Receive selected color from the component
     */
    @Input()
    get selectedColor(): string { return this._selectedColor; }
    set selectedColor(value: string) { this._selectedColor = value || 'none'; }
    private _selectedColor: string = '';

    /**
     * Emit update when a color is selected
     */
    @Output() changeSelectedColor = new EventEmitter;

    /**
     * RGBA current color
     */
    private _rgbaColor: string = 'rgba(255,0,0,1)';

    /**
     * Subject of the current selected color by the user
     */
    private _tmpSelectedColor: BehaviorSubject<string>;

    /**
     * Subscription of the tmpSelectedColor Observable
     */
    private _tmpSelectedColorSub: Subscription;

    /**
     * Subscription of the hexForm values change
     */
    private _hexValuesSub: Subscription;

    /**
     * Subscription of the rbgForm values change
     */
    private _rgbValuesSub: Subscription;

    /**
     * Handle color of the text
     */
    textClass: string = 'black';

    /**
     * Validate if the mouse button is pressed
     */
    _isPressed: boolean = false;

    /**
     * Form of the color in hexa
     */
    hexForm: FormGroup;

    /**
     * Form and keys of the fields in RGB
     */
    rgbKeys = ['R', 'G', 'B'];
    rgbForm: FormGroup;

    constructor(
        private formBuilder: FormBuilder,
        private render: Renderer2
    ) {}

    ngOnInit() {
        this._tmpSelectedColor = new BehaviorSubject<string>(this._selectedColor);
        this._tmpSelectedColorSub = this._tmpSelectedColor.subscribe(color => {
            if (color !== this._selectedColor) {
                if (this.hexForm.get('hexCode').value !== color) {
                    this.hexForm.setValue({hexCode: color});
                }
                this.changeSelectedColor.emit(color);
            }
        });

        // hex form
        this.hexForm = this.formBuilder.group({
            hexCode: [this.selectedColor, [Validators.minLength(7), Validators.maxLength(7)]]
        });

        // rgb dynamic form
        const rgbGroup: any = {};
        const rgbValue: number[] = this._getRGB();
        this.rgbKeys.forEach((key, index) => rgbGroup[key] =
            new FormControl(rgbValue[index], {
                validators: [
                    Validators.min(0),
                    Validators.max(256),
                    Validators.minLength(1),
                    Validators.maxLength(3)
                ],
                updateOn: 'blur'
            }));
        this.rgbForm = this.formBuilder.group(rgbGroup);

        // watch changes on forms
        this._onChanges();
    }

    /**
     * Update RGB, RGBA and Gradient when selectedColor change and
     * the mouse button is pressed
     * @param changes SimpleChanges
     */
    ngOnChanges(changes: SimpleChanges) {
        if ('selectedColor' in changes && changes['selectedColor'].currentValue !== 'none') {
            if (!this._isPressed) {
                this._updateRGB();
                this._updateRGBA();
                if (this._blockContext) {
                    this._fillGradient();
                }
            }

            const rgb = this._getRGB();
            const o = Math.round(((rgb[0] * 299) + (rgb[1] * 587) + (rgb[2] * 114)) / 1000);
            this.textClass = (o > 125) ? 'black' : 'white';
        }
    }

    /**
     * Destroy all subscriptions
     */
    ngOnDestroy() {
        if (this._tmpSelectedColorSub && !this._tmpSelectedColorSub.closed) {
            this._tmpSelectedColorSub.unsubscribe();
        }
        if (this._hexValuesSub && !this._hexValuesSub.closed) {
            this._hexValuesSub.unsubscribe();
        }
        if (this._rgbValuesSub && !this._rgbValuesSub.closed) {
            this._rgbValuesSub.unsubscribe();
        }
    }

    ngAfterViewInit() {
        this.render.listen(this._block.nativeElement, 'mousedown', () => this._isPressed = true);
        this.render.listen(this._block.nativeElement, 'mouseup', () => this._isPressed = false);
        this.render.listen(this._block.nativeElement, 'mouseout', () => this._isPressed = false);
        this.render.listen(this._block.nativeElement, 'mousemove', (e) => this.changeColor(e));
        this._blockContext = this._bc.nativeElement.getContext('2d');
        this._blockContext.rect(0, 0,
            this._bc.nativeElement.width,
            this._bc.nativeElement.height);

        this.render.listen(this._strip.nativeElement, 'mousedown', () => this._isPressed = true);
        this.render.listen(this._strip.nativeElement, 'mouseup', () => this._isPressed = false);
        this.render.listen(this._strip.nativeElement, 'mouseout', () => this._isPressed = false);
        this.render.listen(this._strip.nativeElement, 'mousemove', (e) => this.changeBaseColor(e));
        this._stripContext = this._strip.nativeElement.getContext('2d');
        this._stripContext.rect(0, 0,
            this._strip.nativeElement.width,
            this._strip.nativeElement.height);
        const grd1 = this._stripContext.createLinearGradient(0, 0, 0,
            this._bc.nativeElement.height);
        grd1.addColorStop(0, 'rgba(255, 0, 0, 1)');
        grd1.addColorStop(0.17, 'rgba(255, 255, 0, 1)');
        grd1.addColorStop(0.34, 'rgba(0, 255, 0, 1)');
        grd1.addColorStop(0.51, 'rgba(0, 255, 255, 1)');
        grd1.addColorStop(0.68, 'rgba(0, 0, 255, 1)');
        grd1.addColorStop(0.85, 'rgba(255, 0, 255, 1)');
        grd1.addColorStop(1, 'rgba(255, 0, 0, 1)');
        this._stripContext.fillStyle = grd1;
        this._stripContext.fill();

        this._fillGradient();
    }

    /**
     * Generate colors based on the RGBA color
     */
    private _fillGradient(): void {
        this._blockContext.fillStyle = this._rgbaColor;
        this._blockContext.fillRect(0, 0,
            this._bc.nativeElement.width,
            this._bc.nativeElement.height);

        const grdWhite = this._stripContext.createLinearGradient(0, 0,
            this._bc.nativeElement.width, 0);
        grdWhite.addColorStop(0, 'rgba(255,255,255,1)');
        grdWhite.addColorStop(1, 'rgba(255,255,255,0)');
        this._blockContext.fillStyle = grdWhite;
        this._blockContext.fillRect(0, 0,
            this._bc.nativeElement.width,
            this._bc.nativeElement.height);

        const grdBlack = this._stripContext.createLinearGradient(0, 0, 0,
            this._bc.nativeElement.height);
        grdBlack.addColorStop(0, 'rgba(0,0,0,0)');
        grdBlack.addColorStop(1, 'rgba(0,0,0,1)');
        this._blockContext.fillStyle = grdBlack;
        this._blockContext.fillRect(0, 0,
            this._bc.nativeElement.width,
            this._bc.nativeElement.height);
    }

    /**
     * Watch change on forms
     */
    private _onChanges() {
        // validate digited code and update when digitation is finished
        this._hexValuesSub = this.hexForm.get('hexCode').valueChanges.subscribe(value => {
            if (!this._isPressed && value.length === 7) {
                this._tmpSelectedColor.next(value);
            }
        });

        this._rgbValuesSub = this.rgbForm.valueChanges.subscribe(controls => {
            const data: number[] = [];
            for (const key in controls) {
                if (!controls[key] || controls[key] > 255) {
                    data.push(0);
                    continue;
                }

                data.push(controls[key]);
            }

            const hex = this._getHex(data);
            if (hex !== this._selectedColor && hex.length === 7) {
                this._tmpSelectedColor.next(hex);
            }
        });
    }

    /**
     * Convert HEX/canvas value to rgb
     * @param data any
     * @returns number[]
     */
    private _getRGB(data?: any): number[] {
        if (data) {
            return [data[0], data[1], data[2]];
        }

        const hex = this._selectedColor.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);

        return [r, g, b];
    }

    /**
     * Convert RGB value to HEX
     * @param data any
     * @returns string
     */
    private _getHex(data: any): string {
        const hex = new Array(3);
        hex[0] = data[0].toString(16);
        hex[1] = data[1].toString(16);
        hex[2] = data[2].toString(16);

        hex.forEach((val, key) => {
            if (val.length === 1) {
                hex[key] += '0';
            }
        });

        return `#${hex[0]}${hex[1]}${hex[2]}`.toUpperCase();
    }

    /**
     * Update RGBA color
     * @param data any
     */
    private _updateRGBA(data?: any): void {
        if (!this._selectedColor && !data) {
            this._rgbaColor = 'rgba(255,0,0,1)';
        }

        const rgb = this._getRGB(data);
        this._rgbaColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`;
    }

    /**
     * Update RGB form
     * @param data any
     */
    private _updateRGB(data?: any): void {
        if (!this.rgbForm) { return; }

        if (!data) {
            data = this._getRGB();
        }

        this.rgbForm.setValue({'R': data[0], 'G': data[1], 'B': data[2]});
    }

    /**
     * Get selected base color from the canvas
     * @param e MouseEvent
     */
    private changeBaseColor(e): void {
        if (this._isPressed) {
            this.render.setStyle(this._sc.nativeElement, 'background-position-y', `${e.offsetY}px`);
            const data = this._stripContext.getImageData(e.offsetX, e.offsetY, 1, 1).data;
            this._updateRGBA(data);
            this._fillGradient();
            this.updateValues(data);
        }
    }

    /**
     * Get selected color from the canvas
     * @param e MouseEvent
     */
    private changeColor(e): void {
        if (this._isPressed) {
            this.render.setStyle(this._bp.nativeElement, 'top', `${e.offsetY - 5}px`);
            this.render.setStyle(this._bp.nativeElement, 'left', `${e.offsetX - 5}px`);

            const data = this._blockContext.getImageData(e.offsetX, e.offsetY, 1, 1).data;
            this.updateValues(data);
        }
    }

    /**
     * Emit update from the selected color
     * @param data any
     */
    private updateValues(data: any): void {
        if (data) {
            this._updateRGB(data);
            this._tmpSelectedColor.next(this._getHex(data));
        }
    }

}
